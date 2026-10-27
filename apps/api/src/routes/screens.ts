import { randomInt } from 'crypto';
import type { FastifyPluginAsync } from 'fastify';
import { eq, and, isNotNull } from 'drizzle-orm';
import { db } from '../db/db';
import { tv_screens } from '../db/schema';
import { authenticate } from '../middleware/auth';
import type { JWTPayload } from '../types';
import { SCREEN_ROLE } from '@restosync/shared/enums';

// ── JSON Schema ──────────────────────────────────────────────────────────────
const createScreenBody = {
  type: 'object' as const,
  required: ['role'],
  properties: {
    role: { type: 'string', enum: SCREEN_ROLE as unknown as string[] },
    name: { type: 'string', maxLength: 40 },
  },
  additionalProperties: false,
};

const claimBody = {
  type: 'object' as const,
  required: ['pairing_code'],
  properties: {
    pairing_code: { type: 'string', minLength: 6, maxLength: 6 },
    app_version:  { type: 'string', maxLength: 20 },
  },
  additionalProperties: false,
};

const contentBody = {
  type: 'object' as const,
  properties: {
    name: { type: 'string', maxLength: 40 },
  },
  additionalProperties: false,
};

interface CreateScreenBody { role: string; name?: string }
interface ClaimBody { pairing_code: string; app_version?: string }
interface ContentBody { name?: string }

// ── Plugin ────────────────────────────────────────────────────────────────────
const screensPlugin: FastifyPluginAsync = async (app) => {

  // GET /api/screens
  app.get('/', { preHandler: authenticate }, async (req, reply) => {
    const { store_id } = req.user as JWTPayload;

    const rows = await db
      .select()
      .from(tv_screens)
      .where(eq(tv_screens.store_id, store_id))
      .orderBy(tv_screens.role);

    return reply.send(rows);
  });

  // POST /api/screens — 스크린 레코드 생성 (staff, auth 필요)
  app.post<{ Body: CreateScreenBody }>(
    '/',
    { preHandler: authenticate, schema: { body: createScreenBody } },
    async (req, reply) => {
      const { store_id } = req.user as JWTPayload;
      const { role, name } = req.body;

      const [screen] = await db.insert(tv_screens).values({
        store_id,
        role: role as typeof tv_screens.$inferInsert['role'],
        name,
        online: false,
      }).returning();

      return reply.status(201).send(screen);
    },
  );

  // POST /api/screens/claim — TV가 pairing_code로 스크린 claim (JWT 불필요)
  // 주의: static route이므로 /:id 보다 먼저 등록해야 함
  app.post<{ Body: ClaimBody }>(
    '/claim',
    { schema: { body: claimBody } },
    async (req, reply) => {
      const { pairing_code, app_version } = req.body;
      const now = new Date();

      // AG-008: 유효한 코드 + 만료 미초과 확인
      const [screen] = await db
        .select()
        .from(tv_screens)
        .where(and(
          eq(tv_screens.pairing_code, pairing_code),
          isNotNull(tv_screens.pairing_expires_at),
        ))
        .limit(1);

      if (!screen) return reply.status(404).send({ error: 'INVALID_PAIRING_CODE' });
      if (!screen.pairing_expires_at || screen.pairing_expires_at < now) {
        return reply.status(410).send({ error: 'PAIRING_CODE_EXPIRED' });
      }

      // 코드 소비 + online 마킹
      await db
        .update(tv_screens)
        .set({
          pairing_code: null,
          pairing_expires_at: null,
          online: true,
          last_seen_at: now,
          app_version,
        })
        .where(eq(tv_screens.id, screen.id));

      // device_token: TV가 WS 연결 시 token= 파라미터로 사용
      const deviceToken = app.jwt.sign(
        { sub: screen.id, store_id: screen.store_id, role: screen.role, type: 'device' },
        { expiresIn: '365d' },
      );

      return reply.send({
        screen_id:    screen.id,
        store_id:     screen.store_id,
        role:         screen.role,
        name:         screen.name,
        device_token: deviceToken,
      });
    },
  );

  // POST /api/screens/:id/pair — staff가 pairing 코드 발급 (AG-008)
  app.post<{ Params: { id: string } }>(
    '/:id/pair',
    { preHandler: authenticate },
    async (req, reply) => {
      const { store_id } = req.user as JWTPayload;
      const { id } = req.params;

      const [screen] = await db
        .select()
        .from(tv_screens)
        .where(and(eq(tv_screens.store_id, store_id), eq(tv_screens.id, id)))
        .limit(1);

      if (!screen) return reply.status(404).send({ error: 'SCREEN_NOT_FOUND' });

      const code = String(randomInt(100000, 999999));
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10분

      await db
        .update(tv_screens)
        .set({ pairing_code: code, pairing_expires_at: expiresAt })
        .where(eq(tv_screens.id, id));

      return reply.send({
        pairing_code: code,
        expires_at: expiresAt.toISOString(),
        expires_in_seconds: 600,
      });
    },
  );

  // PATCH /api/screens/:id/content — 스크린 설정 변경 (staff)
  app.patch<{ Params: { id: string }; Body: ContentBody }>(
    '/:id/content',
    { preHandler: authenticate, schema: { body: contentBody } },
    async (req, reply) => {
      const { store_id } = req.user as JWTPayload;
      const { id } = req.params;
      const { name } = req.body;

      if (!name) return reply.status(400).send({ error: 'NO_FIELDS' });

      const [updated] = await db
        .update(tv_screens)
        .set({ name })
        .where(and(eq(tv_screens.store_id, store_id), eq(tv_screens.id, id)))
        .returning();

      if (!updated) return reply.status(404).send({ error: 'SCREEN_NOT_FOUND' });
      return reply.send(updated);
    },
  );

  // DELETE /api/screens/:id/pair — unpair (staff)
  app.delete<{ Params: { id: string } }>(
    '/:id/pair',
    { preHandler: authenticate },
    async (req, reply) => {
      const { store_id } = req.user as JWTPayload;
      const { id } = req.params;

      const [updated] = await db
        .update(tv_screens)
        .set({ online: false, pairing_code: null, pairing_expires_at: null })
        .where(and(eq(tv_screens.store_id, store_id), eq(tv_screens.id, id)))
        .returning();

      if (!updated) return reply.status(404).send({ error: 'SCREEN_NOT_FOUND' });
      return reply.status(204).send();
    },
  );

  // POST /api/screens/:id/heartbeat — TV 생존 신호 (JWT 불필요)
  app.post<{ Params: { id: string } }>(
    '/:id/heartbeat',
    async (req, reply) => {
      const { id } = req.params;

      const [updated] = await db
        .update(tv_screens)
        .set({ online: true, last_seen_at: new Date() })
        .where(eq(tv_screens.id, id))
        .returning();

      if (!updated) return reply.status(404).send({ error: 'SCREEN_NOT_FOUND' });
      return reply.status(204).send();
    },
  );
};

export default screensPlugin;
