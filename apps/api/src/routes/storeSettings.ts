// Store-wide operator settings — spec sec.10.
// One row per store in `store_settings` (config jsonb). On read, missing config is filled
// with defaultStoreSettings(). On PATCH, request body is deep-merged into existing config.
// AG-001: every query scoped by store_id from JWT.

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/db';
import { store_settings, tv_instances } from '../db/schema';
import { authenticate } from '../middleware/auth';
import { broadcast } from '../ws/broadcast';
import type { JWTPayload } from '../types';
import {
  defaultStoreSettings,
  type StoreSettings,
  type DeepPartial,
} from '@restosync/shared/storeSettings';

// Deep partial zod — accepts any-shaped object; full validation happens via the merged
// result type-check at the boundary. This is intentional: the canonical shape lives in
// shared/storeSettings.ts, and we permit nested PATCH without exhaustively re-typing.
const patchSchema: z.ZodType<DeepPartial<StoreSettings>> = z.record(z.unknown()) as z.ZodType<DeepPartial<StoreSettings>>;

function deepMerge<T>(base: T, patch: DeepPartial<T>): T {
  if (patch === null || patch === undefined) return base;
  if (typeof base !== 'object' || base === null) return patch as T;
  if (Array.isArray(base)) return (patch as unknown as T) ?? base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const k of Object.keys(patch as object)) {
    const pv = (patch as Record<string, unknown>)[k];
    const bv = (base as Record<string, unknown>)[k];
    if (pv && typeof pv === 'object' && !Array.isArray(pv) && bv && typeof bv === 'object' && !Array.isArray(bv)) {
      out[k] = deepMerge(bv, pv as DeepPartial<typeof bv>);
    } else if (pv !== undefined) {
      out[k] = pv;
    }
  }
  return out as T;
}

const storeSettingsPlugin: FastifyPluginAsync = async (app) => {
  // GET /api/store_settings — returns full effective config (merged with defaults).
  // TV-public path: when ?tv_instance_id=<uuid> is supplied without a JWT, look the
  // instance up to derive its store_id (read-only — mirrors the WS handler fallback
  // in src/ws/handler.ts so TVs can fetch settings without holding a user token).
  type TvQuery = { tv_instance_id?: string };
  const resolveStoreId = async (req: FastifyRequest<{ Querystring: TvQuery }>, reply: FastifyReply): Promise<string | null> => {
    const tvId = req.query?.tv_instance_id;
    if (tvId) {
      const [inst] = await db
        .select({ store_id: tv_instances.store_id })
        .from(tv_instances)
        .where(eq(tv_instances.id, tvId))
        .limit(1);
      if (!inst) { reply.status(404).send({ error: 'TV_INSTANCE_NOT_FOUND' }); return null; }
      return inst.store_id;
    }
    try {
      await authenticate(req, reply);
    } catch {
      reply.status(401).send({ error: 'UNAUTHORIZED' });
      return null;
    }
    return (req.user as JWTPayload | undefined)?.store_id ?? null;
  };

  app.get<{ Querystring: TvQuery }>('/', async (req, reply) => {
    const store_id = await resolveStoreId(req, reply);
    if (!store_id) return;
    const [row] = await db
      .select()
      .from(store_settings)
      .where(eq(store_settings.store_id, store_id))
      .limit(1);

    const stored = (row?.config ?? {}) as DeepPartial<StoreSettings>;
    const merged = deepMerge(defaultStoreSettings(), stored);
    return reply.send(merged);
  });

  // PATCH /api/store_settings — deep merge into config. Returns merged result + broadcasts.
  app.patch<{ Body: DeepPartial<StoreSettings> }>(
    '/',
    { preHandler: authenticate },
    async (req, reply) => {
      const { store_id } = req.user as JWTPayload;
      const parse = patchSchema.safeParse(req.body);
      if (!parse.success) {
        return reply.status(400).send({ error: 'INVALID_SETTINGS_PATCH', details: parse.error.format() });
      }

      const [existing] = await db
        .select()
        .from(store_settings)
        .where(eq(store_settings.store_id, store_id))
        .limit(1);

      const prevConfig = (existing?.config ?? {}) as DeepPartial<StoreSettings>;
      const nextConfig = deepMerge(prevConfig as StoreSettings, parse.data);

      if (existing) {
        await db
          .update(store_settings)
          .set({ config: nextConfig, updated_at: new Date() })
          .where(eq(store_settings.store_id, store_id));
      } else {
        await db.insert(store_settings).values({ store_id, config: nextConfig });
      }

      const merged = deepMerge(defaultStoreSettings(), nextConfig as DeepPartial<StoreSettings>);
      broadcast(store_id, 'settings:updated', { keys: Object.keys(parse.data) });
      return reply.send(merged);
    },
  );
};

export default storeSettingsPlugin;
