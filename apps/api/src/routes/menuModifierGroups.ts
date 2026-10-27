// Sprint 4 S4.5b — Modifier Groups + Options CRUD (M01 PRD v1.2 §5.2, BR-17)
// AG-001 store_id WHERE / AG-009 /api prefix / AG-013 정본 enum
// AG-023 broadcast은 commit 후 / BR-05 soft delete / BR-11 i18n
// AM01-010 isNull(deleted_at) in UPDATE WHERE / AM01-013 invalidate→broadcast
// AM01-014 menu 이벤트는 TV(menu) + Tablet 양쪽
//
// is_required && min_select===0 → 422 (Zod refine on POST, server check on PATCH after merge)
// max_select NULL = unlimited
// Group/Option mutations broadcast 'display:full_refresh' since attached items unknown 시점.

import type { FastifyPluginAsync } from 'fastify';
import { eq, and, isNull, asc, inArray } from 'drizzle-orm';
import { db } from '../db/db';
import { menu_modifier_groups, menu_modifier_options } from '../db/schema';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { broadcast } from '../ws/broadcast';
import { logAudit } from '../services/audit';
import { invalidateSnapshot } from '../services/menuSnapshot';
import type { JWTPayload } from '../types';
import {
  ModifierGroupCreateSchema,
  ModifierGroupUpdateSchema,
  ModifierGroupListQuerySchema,
  ModifierOptionCreateSchema,
  ModifierOptionUpdateSchema,
} from '../schemas/menu';

const menuFilter = (c: { device_type: string; role?: string }) =>
  c.device_type === 'tablet' || (c.device_type === 'tv' && c.role === 'menu');

async function getOwnedGroup(store_id: string, group_id: string) {
  const [row] = await db.select().from(menu_modifier_groups)
    .where(and(
      eq(menu_modifier_groups.store_id, store_id),
      eq(menu_modifier_groups.id, group_id),
      isNull(menu_modifier_groups.deleted_at),
    ))
    .limit(1);
  return row ?? null;
}

async function listGroupOptions(store_id: string, group_id: string) {
  return db.select().from(menu_modifier_options)
    .where(and(
      eq(menu_modifier_options.store_id, store_id),
      eq(menu_modifier_options.group_id, group_id),
      isNull(menu_modifier_options.deleted_at),
    ))
    .orderBy(asc(menu_modifier_options.sort_order), asc(menu_modifier_options.created_at), asc(menu_modifier_options.id));
}

const modifierGroupsPlugin: FastifyPluginAsync = async (app) => {

  // GET /api/menu/modifier-groups
  app.get('/', { preHandler: authenticate }, async (req, reply) => {
    const { store_id } = req.user as JWTPayload;
    const parsed = ModifierGroupListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'INVALID_QUERY', issues: parsed.error.issues });
    }
    const q = parsed.data;

    const groups = await db.select().from(menu_modifier_groups)
      .where(and(
        eq(menu_modifier_groups.store_id, store_id),
        isNull(menu_modifier_groups.deleted_at),
      ))
      .orderBy(asc(menu_modifier_groups.created_at), asc(menu_modifier_groups.id))
      .limit(q.limit)
      .offset(q.offset);

    if (!q.with_options || groups.length === 0) {
      return reply.send(groups.map((g) => ({ ...g, options: [] as unknown[] })));
    }

    const groupIds = groups.map((g) => g.id);
    const options = await db.select().from(menu_modifier_options)
      .where(and(
        eq(menu_modifier_options.store_id, store_id),
        inArray(menu_modifier_options.group_id, groupIds),
        isNull(menu_modifier_options.deleted_at),
      ))
      .orderBy(asc(menu_modifier_options.sort_order), asc(menu_modifier_options.created_at), asc(menu_modifier_options.id));

    const byGroup = new Map<string, typeof options>();
    for (const o of options) {
      const arr = byGroup.get(o.group_id) ?? [];
      arr.push(o);
      byGroup.set(o.group_id, arr);
    }
    return reply.send(groups.map((g) => ({ ...g, options: byGroup.get(g.id) ?? [] })));
  });

  // GET /api/menu/modifier-groups/:id — single group + options
  app.get<{ Params: { id: string } }>('/:id', {
    preHandler: authenticate,
  }, async (req, reply) => {
    const { store_id } = req.user as JWTPayload;
    const group = await getOwnedGroup(store_id, req.params.id);
    if (!group) return reply.status(404).send({ error: 'MODIFIER_GROUP_NOT_FOUND' });
    const options = await listGroupOptions(store_id, group.id);
    return reply.send({ ...group, options });
  });

  // POST /api/menu/modifier-groups — optional nested options
  app.post('/', {
    preHandler: [authenticate, requireRole(['owner', 'manager'])],
  }, async (req, reply) => {
    const { store_id, sub: user_id } = req.user as JWTPayload;
    const parsed = ModifierGroupCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'INVALID_BODY', issues: parsed.error.issues });
    }
    const data = parsed.data;

    const { group, options } = await db.transaction(async (tx) => {
      const [g] = await tx.insert(menu_modifier_groups).values({
        store_id,
        name:        data.name,
        min_select:  data.min_select,
        max_select:  data.max_select ?? null,
        is_required: data.is_required,
      }).returning();

      let opts: typeof menu_modifier_options.$inferSelect[] = [];
      if (data.options && data.options.length > 0) {
        opts = await tx.insert(menu_modifier_options).values(
          data.options.map((o) => ({
            store_id,
            group_id:          g.id,
            name:              o.name,
            price_delta_cents: o.price_delta_cents,
            is_default:        o.is_default,
            sort_order:        o.sort_order,
          })),
        ).returning();
      }
      return { group: g, options: opts };
    });

    await logAudit({
      store_id, entity_type: 'menu_modifier_group', entity_id: group.id,
      operation: 'create', user_id,
      after: { group, options } as unknown as Record<string, unknown>,
    }, req.log);

    await invalidateSnapshot(store_id);
    broadcast(store_id, 'display:full_refresh', { reason: 'modifier_group_added' }, menuFilter);

    return reply.status(201).send({ ...group, options });
  });

  // PATCH /api/menu/modifier-groups/:id
  app.patch<{ Params: { id: string } }>('/:id', {
    preHandler: [authenticate, requireRole(['owner', 'manager'])],
  }, async (req, reply) => {
    const { store_id, sub: user_id } = req.user as JWTPayload;
    const parsed = ModifierGroupUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'INVALID_BODY', issues: parsed.error.issues });
    }
    const data = parsed.data;
    if (Object.keys(data).length === 0) {
      return reply.status(400).send({ error: 'EMPTY_PATCH' });
    }

    const before = await getOwnedGroup(store_id, req.params.id);
    if (!before) return reply.status(404).send({ error: 'MODIFIER_GROUP_NOT_FOUND' });

    // Internal consistency after merge.
    const merged = {
      min_select:  data.min_select  ?? before.min_select,
      max_select:  data.max_select  === undefined ? before.max_select : data.max_select,
      is_required: data.is_required ?? before.is_required,
    };
    if (merged.is_required && merged.min_select === 0) {
      return reply.status(422).send({
        error: 'INVALID_GROUP_CONSTRAINTS',
        message: 'is_required=true requires min_select >= 1',
      });
    }
    if (merged.max_select != null && merged.max_select < merged.min_select) {
      return reply.status(422).send({
        error: 'INVALID_GROUP_CONSTRAINTS',
        message: 'max_select must be >= min_select',
      });
    }

    const [updated] = await db.update(menu_modifier_groups)
      .set({ ...data, updated_at: new Date() })
      .where(and(
        eq(menu_modifier_groups.store_id, store_id),
        eq(menu_modifier_groups.id, req.params.id),
        isNull(menu_modifier_groups.deleted_at),
      ))
      .returning();
    if (!updated) return reply.status(404).send({ error: 'MODIFIER_GROUP_NOT_FOUND' });

    await logAudit({
      store_id, entity_type: 'menu_modifier_group', entity_id: updated.id,
      operation: 'update', user_id,
      before: before as unknown as Record<string, unknown>,
      after: updated as unknown as Record<string, unknown>,
    }, req.log);

    await invalidateSnapshot(store_id);
    broadcast(store_id, 'display:full_refresh', { reason: 'modifier_group_updated' }, menuFilter);

    return reply.send(updated);
  });

  // DELETE /api/menu/modifier-groups/:id — soft + cascade soft-delete options
  app.delete<{ Params: { id: string } }>('/:id', {
    preHandler: [authenticate, requireRole(['owner', 'manager'])],
  }, async (req, reply) => {
    const { store_id, sub: user_id } = req.user as JWTPayload;
    const before = await getOwnedGroup(store_id, req.params.id);
    if (!before) return reply.status(404).send({ error: 'MODIFIER_GROUP_NOT_FOUND' });

    await db.transaction(async (tx) => {
      const now = new Date();
      await tx.update(menu_modifier_groups)
        .set({ deleted_at: now, updated_at: now })
        .where(and(
          eq(menu_modifier_groups.store_id, store_id),
          eq(menu_modifier_groups.id, before.id),
          isNull(menu_modifier_groups.deleted_at),
        ));
      await tx.update(menu_modifier_options)
        .set({ deleted_at: now, updated_at: now })
        .where(and(
          eq(menu_modifier_options.store_id, store_id),
          eq(menu_modifier_options.group_id, before.id),
          isNull(menu_modifier_options.deleted_at),
        ));
    });

    await logAudit({
      store_id, entity_type: 'menu_modifier_group', entity_id: before.id,
      operation: 'delete', user_id,
      before: before as unknown as Record<string, unknown>,
    }, req.log);

    await invalidateSnapshot(store_id);
    broadcast(store_id, 'display:full_refresh', { reason: 'modifier_group_deleted' }, menuFilter);

    return reply.status(204).send();
  });

  // ── Options sub-routes ─────────────────────────────────────────────────────

  // POST /api/menu/modifier-groups/:id/options
  app.post<{ Params: { id: string } }>('/:id/options', {
    preHandler: [authenticate, requireRole(['owner', 'manager'])],
  }, async (req, reply) => {
    const { store_id, sub: user_id } = req.user as JWTPayload;
    const parsed = ModifierOptionCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'INVALID_BODY', issues: parsed.error.issues });
    }
    const data = parsed.data;

    const group = await getOwnedGroup(store_id, req.params.id);
    if (!group) return reply.status(404).send({ error: 'MODIFIER_GROUP_NOT_FOUND' });

    const [option] = await db.insert(menu_modifier_options).values({
      store_id,
      group_id:          group.id,
      name:              data.name,
      price_delta_cents: data.price_delta_cents,
      is_default:        data.is_default,
      sort_order:        data.sort_order,
    }).returning();

    await logAudit({
      store_id, entity_type: 'menu_modifier_group', entity_id: group.id,
      operation: 'update', user_id,
      after: { option_added: option } as unknown as Record<string, unknown>,
    }, req.log);

    await invalidateSnapshot(store_id);
    broadcast(store_id, 'display:full_refresh',
      { reason: 'modifier_option_added', group_id: group.id }, menuFilter);

    return reply.status(201).send(option);
  });

  // PATCH /api/menu/modifier-groups/:id/options/:option_id
  app.patch<{ Params: { id: string; option_id: string } }>(
    '/:id/options/:option_id',
    { preHandler: [authenticate, requireRole(['owner', 'manager'])] },
    async (req, reply) => {
      const { store_id, sub: user_id } = req.user as JWTPayload;
      const parsed = ModifierOptionUpdateSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: 'INVALID_BODY', issues: parsed.error.issues });
      }
      const data = parsed.data;
      if (Object.keys(data).length === 0) {
        return reply.status(400).send({ error: 'EMPTY_PATCH' });
      }

      const group = await getOwnedGroup(store_id, req.params.id);
      if (!group) return reply.status(404).send({ error: 'MODIFIER_GROUP_NOT_FOUND' });

      const [before] = await db.select().from(menu_modifier_options)
        .where(and(
          eq(menu_modifier_options.store_id, store_id),
          eq(menu_modifier_options.group_id, group.id),
          eq(menu_modifier_options.id, req.params.option_id),
          isNull(menu_modifier_options.deleted_at),
        ))
        .limit(1);
      if (!before) return reply.status(404).send({ error: 'MODIFIER_OPTION_NOT_FOUND' });

      const [updated] = await db.update(menu_modifier_options)
        .set({ ...data, updated_at: new Date() })
        .where(and(
          eq(menu_modifier_options.store_id, store_id),
          eq(menu_modifier_options.group_id, group.id),
          eq(menu_modifier_options.id, req.params.option_id),
          isNull(menu_modifier_options.deleted_at),
        ))
        .returning();
      if (!updated) return reply.status(404).send({ error: 'MODIFIER_OPTION_NOT_FOUND' });

      await logAudit({
        store_id, entity_type: 'menu_modifier_group', entity_id: group.id,
        operation: 'update', user_id,
        before: { option_before: before } as unknown as Record<string, unknown>,
        after:  { option_after: updated } as unknown as Record<string, unknown>,
      }, req.log);

      await invalidateSnapshot(store_id);
      broadcast(store_id, 'display:full_refresh',
        { reason: 'modifier_option_updated', group_id: group.id }, menuFilter);

      return reply.send(updated);
    },
  );

  // DELETE /api/menu/modifier-groups/:id/options/:option_id (soft)
  app.delete<{ Params: { id: string; option_id: string } }>(
    '/:id/options/:option_id',
    { preHandler: [authenticate, requireRole(['owner', 'manager'])] },
    async (req, reply) => {
      const { store_id, sub: user_id } = req.user as JWTPayload;

      const group = await getOwnedGroup(store_id, req.params.id);
      if (!group) return reply.status(404).send({ error: 'MODIFIER_GROUP_NOT_FOUND' });

      const [before] = await db.select().from(menu_modifier_options)
        .where(and(
          eq(menu_modifier_options.store_id, store_id),
          eq(menu_modifier_options.group_id, group.id),
          eq(menu_modifier_options.id, req.params.option_id),
          isNull(menu_modifier_options.deleted_at),
        ))
        .limit(1);
      if (!before) return reply.status(404).send({ error: 'MODIFIER_OPTION_NOT_FOUND' });

      const now = new Date();
      await db.update(menu_modifier_options)
        .set({ deleted_at: now, updated_at: now })
        .where(and(
          eq(menu_modifier_options.store_id, store_id),
          eq(menu_modifier_options.group_id, group.id),
          eq(menu_modifier_options.id, req.params.option_id),
          isNull(menu_modifier_options.deleted_at),
        ));

      await logAudit({
        store_id, entity_type: 'menu_modifier_group', entity_id: group.id,
        operation: 'update', user_id,
        before: { option_deleted: before } as unknown as Record<string, unknown>,
      }, req.log);

      await invalidateSnapshot(store_id);
      broadcast(store_id, 'display:full_refresh',
        { reason: 'modifier_option_deleted', group_id: group.id }, menuFilter);

      return reply.status(204).send();
    },
  );

};

export default modifierGroupsPlugin;
