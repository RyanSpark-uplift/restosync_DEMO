import type { FastifyPluginAsync } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/db';
import { tv_instances, tv_content_profiles } from '../db/schema';
import { authenticate } from '../middleware/auth';
import { broadcast } from '../ws/broadcast';
import type { JWTPayload } from '../types';
import { TV_FUNCTION_TYPE } from '@restosync/shared/enums';

// function_type → WS role (WsClient.role matches screen_role values)
const FT_TO_ROLE: Record<string, string> = {
  menu:    'menu',
  pickup:  'pickup',
  event:   'event',
  ad:      'ai_ads',
};

// ── JSON Schema ──────────────────────────────────────────────────────────────
const createBody = {
  type: 'object' as const,
  required: ['function_type'],
  properties: {
    display_name:  { type: 'string', maxLength: 80 },
    function_type: { type: 'string', enum: TV_FUNCTION_TYPE as unknown as string[] },
    profile_id:    { type: 'string', format: 'uuid' },
    ip_address:    { type: 'string', maxLength: 45 },
    sort_order:    { type: 'integer', default: 0 },
  },
  additionalProperties: false,
};

const profileBody = {
  type: 'object' as const,
  required: ['profile_id'],
  properties: {
    profile_id: { type: 'string', format: 'uuid' },
  },
  additionalProperties: false,
};

interface CreateBody {
  display_name?: string;
  function_type: string;
  profile_id?: string;
  ip_address?: string;
  sort_order?: number;
}
interface ProfileBody { profile_id: string }

// ── Shared select shape (instance + profile LEFT JOIN) ────────────────────────
const withProfile = {
  instance: tv_instances,
  profile:  tv_content_profiles,
} as const;

// ── Plugin ────────────────────────────────────────────────────────────────────
const tvInstancesPlugin: FastifyPluginAsync = async (app) => {

  // GET /api/tv-instances — list with profile JOIN
  app.get('/', { preHandler: authenticate }, async (req, reply) => {
    const { store_id } = req.user as JWTPayload;

    const rows = await db
      .select(withProfile)
      .from(tv_instances)
      .leftJoin(tv_content_profiles, eq(tv_instances.profile_id, tv_content_profiles.id))
      .where(eq(tv_instances.store_id, store_id))
      .orderBy(tv_instances.sort_order);

    return reply.send(rows);
  });

  // POST /api/tv-instances — register new TV instance
  app.post<{ Body: CreateBody }>(
    '/',
    { preHandler: authenticate, schema: { body: createBody } },
    async (req, reply) => {
      const { store_id } = req.user as JWTPayload;
      const { display_name, function_type, profile_id, ip_address, sort_order = 0 } = req.body;

      const [instance] = await db.insert(tv_instances).values({
        store_id,
        display_name,
        function_type: function_type as typeof tv_instances.$inferInsert['function_type'],
        profile_id,
        ip_address,
        is_active: true,
        sort_order,
      }).returning();

      return reply.status(201).send(instance);
    },
  );

  // GET /api/tv-instances/:id — TV 부팅 시 config 로드 (auth 불필요)
  app.get<{ Params: { id: string } }>(
    '/:id',
    async (req, reply) => {
      const { id } = req.params;

      const [row] = await db
        .select(withProfile)
        .from(tv_instances)
        .leftJoin(tv_content_profiles, eq(tv_instances.profile_id, tv_content_profiles.id))
        .where(eq(tv_instances.id, id))
        .limit(1);

      if (!row) return reply.status(404).send({ error: 'INSTANCE_NOT_FOUND' });
      return reply.send(row);
    },
  );

  // PATCH /api/tv-instances/:id/profile — 프로파일 변경 + WS config push
  app.patch<{ Params: { id: string }; Body: ProfileBody }>(
    '/:id/profile',
    { preHandler: authenticate, schema: { body: profileBody } },
    async (req, reply) => {
      const { store_id } = req.user as JWTPayload;
      const { id } = req.params;
      const { profile_id } = req.body;

      // 프로파일이 같은 매장 소속인지 확인 (AG-001)
      const [profile] = await db
        .select()
        .from(tv_content_profiles)
        .where(and(eq(tv_content_profiles.id, profile_id), eq(tv_content_profiles.store_id, store_id)))
        .limit(1);

      if (!profile) return reply.status(404).send({ error: 'PROFILE_NOT_FOUND' });

      const [updated] = await db
        .update(tv_instances)
        .set({ profile_id })
        .where(and(eq(tv_instances.id, id), eq(tv_instances.store_id, store_id)))
        .returning();

      if (!updated) return reply.status(404).send({ error: 'INSTANCE_NOT_FOUND' });

      // WS: 해당 function_type의 TV 화면에 config 갱신 push
      const wsRole = FT_TO_ROLE[updated.function_type ?? ''];
      if (wsRole) {
        broadcast(
          store_id,
          'display:config_push',
          { tv_instance_id: id, profile },
          (c) => c.device_type === 'tv' && c.role === wsRole,
        );
      }

      return reply.send({ instance: updated, profile });
    },
  );

  // POST /api/tv-instances/:id/ping — heartbeat (auth 불필요, TV 측)
  app.post<{ Params: { id: string } }>(
    '/:id/ping',
    async (req, reply) => {
      const { id } = req.params;

      const [updated] = await db
        .update(tv_instances)
        .set({ last_ping_at: new Date(), is_active: true })
        .where(eq(tv_instances.id, id))
        .returning({ id: tv_instances.id });

      if (!updated) return reply.status(404).send({ error: 'INSTANCE_NOT_FOUND' });
      return reply.status(204).send();
    },
  );

  // DELETE /api/tv-instances/:id
  app.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: authenticate },
    async (req, reply) => {
      const { store_id } = req.user as JWTPayload;
      const { id } = req.params;

      const [deleted] = await db
        .delete(tv_instances)
        .where(and(eq(tv_instances.id, id), eq(tv_instances.store_id, store_id)))
        .returning({ id: tv_instances.id });

      if (!deleted) return reply.status(404).send({ error: 'INSTANCE_NOT_FOUND' });
      return reply.status(204).send();
    },
  );
};

export default tvInstancesPlugin;
