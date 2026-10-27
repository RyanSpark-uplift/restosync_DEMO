import type { FastifyPluginAsync } from 'fastify';
import { eq, and, isNull, gt } from 'drizzle-orm';
import { db } from '../db/db';
import { tv_pairing_requests, tv_instances } from '../db/schema';
import { authenticate } from '../middleware/auth';
import type { JWTPayload } from '../types';
import { TV_FUNCTION_TYPE } from '@restosync/shared/enums';

// 10-minute window — matches AG-008 spec for screens pairing. Long enough that
// staff can walk from TV to tablet, short enough that an abandoned code can't
// be brute-forced (10^6 search space → ~5min at 10 RPS rate-limit cap).
const PAIRING_TTL_MS = 10 * 60_000;

// 6-char alnum, omits I/L/O/0/1 to avoid TV-vs-tablet read-ambiguity.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateCode(): string {
  let out = '';
  // crypto for unbiased pick; fall back to Math.random in pathological
  // test envs where crypto is missing.
  const cryptoObj: { getRandomValues?: (a: Uint8Array) => Uint8Array } =
    (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto ?? {};
  const buf = new Uint8Array(6);
  if (cryptoObj.getRandomValues) cryptoObj.getRandomValues(buf);
  else for (let i = 0; i < 6; i++) buf[i] = Math.floor(Math.random() * 256);
  for (let i = 0; i < 6; i++) out += CODE_ALPHABET[buf[i] % CODE_ALPHABET.length];
  return out;
}

// ── JSON Schemas ─────────────────────────────────────────────────────────────
const requestBody = {
  type: 'object' as const,
  required: ['device_id'],
  properties: {
    device_id: { type: 'string', minLength: 1, maxLength: 128 },
  },
  additionalProperties: false,
};

const statusQuery = {
  type: 'object' as const,
  required: ['code'],
  properties: {
    code: { type: 'string', minLength: 6, maxLength: 6 },
  },
};

const claimBody = {
  type: 'object' as const,
  required: ['pairing_code', 'function_type'],
  properties: {
    pairing_code:  { type: 'string', minLength: 6, maxLength: 6 },
    function_type: { type: 'string', enum: TV_FUNCTION_TYPE as unknown as string[] },
    display_name:  { type: 'string', maxLength: 80 },
  },
  additionalProperties: false,
};

interface RequestBody { device_id: string }
interface StatusQuery  { code: string }
interface ClaimBody {
  pairing_code:  string;
  function_type: string;
  display_name?: string;
}

// ── Plugin ────────────────────────────────────────────────────────────────────
const tvPairingPlugin: FastifyPluginAsync = async (app) => {

  // POST /api/tv-instances/pair-request — TV starts pairing. No auth.
  // Generates a 6-char code, stores with 10min expiry, returns to TV for display.
  app.post<{ Body: RequestBody }>(
    '/pair-request',
    { schema: { body: requestBody } },
    async (req, reply) => {
      const { device_id } = req.body;

      // Generate code with retry on UNIQUE collision (extremely rare:
      // 31^6 ≈ 887M space, even 1000 active codes → <0.001% collision).
      let pairing_code = '';
      let inserted = false;
      const expires_at = new Date(Date.now() + PAIRING_TTL_MS);

      for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
        pairing_code = generateCode();
        try {
          await db.insert(tv_pairing_requests).values({
            pairing_code,
            device_id,
            expires_at,
          });
          inserted = true;
        } catch {
          // PK collision — retry with new code.
        }
      }
      if (!inserted) {
        return reply.status(503).send({ error: 'PAIRING_CODE_GENERATION_FAILED' });
      }

      return reply.status(201).send({ pairing_code, expires_at: expires_at.toISOString() });
    },
  );

  // GET /api/tv-instances/pair-status?code=X — TV polls every 2s. No auth.
  // Returns: { status: 'pending' } | { status: 'expired' }
  //       | { status: 'claimed', tv_instance_id }
  app.get<{ Querystring: StatusQuery }>(
    '/pair-status',
    { schema: { querystring: statusQuery } },
    async (req, reply) => {
      const { code } = req.query;
      const now = new Date();

      const [row] = await db
        .select()
        .from(tv_pairing_requests)
        .where(eq(tv_pairing_requests.pairing_code, code))
        .limit(1);

      if (!row) return reply.status(404).send({ error: 'CODE_NOT_FOUND' });

      if (row.claimed_at && row.tv_instance_id) {
        return reply.send({ status: 'claimed', tv_instance_id: row.tv_instance_id });
      }
      if (row.expires_at < now) {
        return reply.send({ status: 'expired' });
      }
      return reply.send({ status: 'pending' });
    },
  );

  // POST /api/tv-instances/pair-claim — Tablet (staff JWT) claims a code.
  // Creates the tv_instances row under staff's store_id, links via tv_pairing_requests.
  app.post<{ Body: ClaimBody }>(
    '/pair-claim',
    { preHandler: authenticate, schema: { body: claimBody } },
    async (req, reply) => {
      const { store_id } = req.user as JWTPayload;
      const { pairing_code, function_type, display_name } = req.body;
      const now = new Date();

      // Look up + validate the pairing request first (auth required so AG-001
      // is satisfied by tx that updates store-scoped rows below).
      const [pending] = await db
        .select()
        .from(tv_pairing_requests)
        .where(and(
          eq(tv_pairing_requests.pairing_code, pairing_code),
          isNull(tv_pairing_requests.claimed_at),
          gt(tv_pairing_requests.expires_at, now),
        ))
        .limit(1);

      if (!pending) return reply.status(404).send({ error: 'CODE_NOT_FOUND_OR_EXPIRED' });

      // Create the tv_instances row.
      const [instance] = await db.insert(tv_instances).values({
        store_id,
        display_name: display_name ?? null,
        function_type: function_type as typeof tv_instances.$inferInsert['function_type'],
        is_active: true,
      }).returning();

      // Link the pairing request → instance + mark claimed.
      await db.update(tv_pairing_requests)
        .set({ claimed_at: now, tv_instance_id: instance.id })
        .where(eq(tv_pairing_requests.pairing_code, pairing_code));

      return reply.status(201).send({ instance });
    },
  );

};

export default tvPairingPlugin;
