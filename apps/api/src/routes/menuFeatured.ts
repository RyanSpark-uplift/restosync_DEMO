// Sprint F.A — Featured Banner rotation routes (PRD §3.6 / §4.2 / §5.2 / BR-21)
// GET /api/menu/featured/current  → TV pool + rotation_seconds
// GET /api/menu/featured/rules    → Tablet edit page
// PUT /api/menu/featured/rules    → owner/manager only, AM01-013 invalidate-before-broadcast
//
// AG-001 store_id JWT only / AG-009 /api prefix / AG-013 FEATURED_RULE_TYPE 정본
// AG-023 commit → invalidate → broadcast 순서 (AM01-013)

import type { FastifyPluginAsync } from 'fastify';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '../db/db';
import { menu_featured_rules, stores } from '../db/schema';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { broadcast } from '../ws/broadcast';
import { logAudit } from '../services/audit';
import { invalidateSnapshot } from '../services/menuSnapshot';
import { evaluateFeaturedPool } from '../services/menuFeatured';
import {
  FeaturedCurrentQuerySchema,
  FeaturedRulesPutSchema,
} from '../schemas/menu';
import type { JWTPayload } from '../types';
import type { FeaturedRuleType } from '@restosync/shared/enums';

const featuredPlugin: FastifyPluginAsync = async (app) => {

  // GET /api/menu/featured/current — TV consumer, also Tablet preview
  app.get('/current', { preHandler: authenticate }, async (req, reply) => {
    const { store_id } = req.user as JWTPayload;
    const parsed = FeaturedCurrentQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.status(422).send({ error: 'INVALID_QUERY', issues: parsed.error.issues });
    }
    try {
      const pool = await evaluateFeaturedPool(store_id, { limit: parsed.data.limit });
      return reply.send(pool);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'STORE_NOT_FOUND') return reply.status(404).send({ error: 'STORE_NOT_FOUND' });
      throw err;
    }
  });

  // GET /api/menu/featured/rules — Page F edit screen
  app.get('/rules', { preHandler: authenticate }, async (req, reply) => {
    const { store_id } = req.user as JWTPayload;

    const [store] = await db.select({
      featured_rotation_seconds: stores.featured_rotation_seconds,
    }).from(stores).where(eq(stores.id, store_id)).limit(1);
    if (!store) return reply.status(404).send({ error: 'STORE_NOT_FOUND' });

    const rules = await db.select({
      id:         menu_featured_rules.id,
      rule_type:  menu_featured_rules.rule_type,
      is_active:  menu_featured_rules.is_active,
      priority:   menu_featured_rules.priority,
      params:     menu_featured_rules.params,
      updated_at: menu_featured_rules.updated_at,
    }).from(menu_featured_rules)
      .where(eq(menu_featured_rules.store_id, store_id))
      .orderBy(asc(menu_featured_rules.rule_type), asc(menu_featured_rules.id));

    return reply.send({
      rules,
      rotation_seconds: store.featured_rotation_seconds ?? 8,
    });
  });

  // PUT /api/menu/featured/rules — owner/manager 전체 교체
  app.put('/rules', {
    preHandler: [authenticate, requireRole(['owner', 'manager'])],
  }, async (req, reply) => {
    const { store_id, sub: user_id } = req.user as JWTPayload;
    const parsed = FeaturedRulesPutSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.status(422).send({ error: 'INVALID_RULES', issues: parsed.error.issues });
    }

    const [before] = await db.select({
      featured_rotation_seconds: stores.featured_rotation_seconds,
    }).from(stores).where(eq(stores.id, store_id)).limit(1);
    if (!before) return reply.status(404).send({ error: 'STORE_NOT_FOUND' });

    const beforeRules = await db.select({
      rule_type: menu_featured_rules.rule_type,
      is_active: menu_featured_rules.is_active,
      priority:  menu_featured_rules.priority,
      params:    menu_featured_rules.params,
    }).from(menu_featured_rules).where(eq(menu_featured_rules.store_id, store_id));

    // 전체 교체 1tx (BR-31 의도: 부분 실패 방지). chunk by rule_type — upsert + delete missing.
    await db.transaction(async (tx) => {
      const incoming = new Map(parsed.data.rules.map((r) => [r.rule_type, r]));

      // 1) delete rule_types not present in payload
      const existing = await tx.select({ rule_type: menu_featured_rules.rule_type })
        .from(menu_featured_rules).where(eq(menu_featured_rules.store_id, store_id));
      const toDelete = existing.filter((e) => !incoming.has(e.rule_type as FeaturedRuleType));
      for (const e of toDelete) {
        await tx.delete(menu_featured_rules).where(and(
          eq(menu_featured_rules.store_id, store_id),
          eq(menu_featured_rules.rule_type, e.rule_type),
        ));
      }

      // 2) upsert incoming
      for (const r of parsed.data.rules) {
        await tx.insert(menu_featured_rules).values({
          store_id,
          rule_type:  r.rule_type,
          is_active:  r.is_active,
          priority:   r.priority,
          params:     r.params,
        }).onConflictDoUpdate({
          target: [menu_featured_rules.store_id, menu_featured_rules.rule_type],
          set: {
            is_active:  r.is_active,
            priority:   r.priority,
            params:     r.params,
            updated_at: new Date(),
          },
        });
      }

      // 3) update rotation_seconds if provided
      if (parsed.data.rotation_seconds != null) {
        await tx.update(stores)
          .set({ featured_rotation_seconds: parsed.data.rotation_seconds })
          .where(eq(stores.id, store_id));
      }
    });

    await logAudit({
      store_id,
      entity_type: 'menu_featured_rule',
      entity_id:   store_id,                                                       // store-scoped config (no row id)
      operation:   'update',
      user_id,
      before: {
        rules: beforeRules,
        rotation_seconds: before.featured_rotation_seconds,
      },
      after: {
        rules: parsed.data.rules,
        rotation_seconds: parsed.data.rotation_seconds ?? before.featured_rotation_seconds,
      },
    }, req.log);

    // AM01-013: invalidate snapshot BEFORE broadcast (TV cache hydration race)
    await invalidateSnapshot(store_id);

    broadcast(store_id, 'display:featured_config_changed', {
      rotation_seconds: parsed.data.rotation_seconds ?? before.featured_rotation_seconds,
      active_rule_types: parsed.data.rules.filter((r) => r.is_active).map((r) => r.rule_type),
    }, (c) => c.device_type === 'tablet' || (c.device_type === 'tv' && c.role === 'menu'));

    // Return updated state — same shape as GET /rules
    const rulesAfter = await db.select({
      id:         menu_featured_rules.id,
      rule_type:  menu_featured_rules.rule_type,
      is_active:  menu_featured_rules.is_active,
      priority:   menu_featured_rules.priority,
      params:     menu_featured_rules.params,
      updated_at: menu_featured_rules.updated_at,
    }).from(menu_featured_rules)
      .where(eq(menu_featured_rules.store_id, store_id))
      .orderBy(asc(menu_featured_rules.rule_type), asc(menu_featured_rules.id));

    return reply.send({
      rules: rulesAfter,
      rotation_seconds: parsed.data.rotation_seconds ?? before.featured_rotation_seconds,
    });
  });
};

export default featuredPlugin;
