// Sprint 1 S1.14 — Menu Categories CRUD + reorder (M01 PRD v1.2 §4.3 Page C)
// AG-001 store_id WHERE / AG-018 (store_id, external_id) partial unique / BR-05 soft delete
// BR-14 카테고리 삭제 차단: 연결된 menu_items가 있으면 409
// AG-023 WS broadcast는 commit 후

import type { FastifyPluginAsync } from 'fastify';
import { eq, and, isNull, count } from 'drizzle-orm';
import { db } from '../db/db';
import { menu_categories, menu_items } from '../db/schema';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { broadcast } from '../ws/broadcast';
import { logAudit } from '../services/audit';
import { invalidateSnapshot } from '../services/menuSnapshot';
import type { JWTPayload } from '../types';
import {
  CategoryCreateSchema,
  CategoryUpdateSchema,
  CategoryReorderSchema,
  CategoryListQuerySchema,
} from '../schemas/menu';

const categoriesPlugin: FastifyPluginAsync = async (app) => {

  // GET /api/menu/categories — AG-021 server-side filter + max limit
  app.get('/', { preHandler: authenticate }, async (req, reply) => {
    const { store_id } = req.user as JWTPayload;
    const parsed = CategoryListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'INVALID_QUERY', issues: parsed.error.issues });
    }
    const q = parsed.data;
    const conditions = [
      eq(menu_categories.store_id, store_id),
      isNull(menu_categories.deleted_at),
    ];
    if (q.is_active !== undefined) conditions.push(eq(menu_categories.is_active, q.is_active));

    const rows = await db.select().from(menu_categories)
      .where(and(...conditions))
      // id as deterministic tiebreaker (see menu.ts ORDER BY note)
      .orderBy(menu_categories.sort_order, menu_categories.created_at, menu_categories.id)
      .limit(q.limit)
      .offset(q.offset);
    return reply.send(rows);
  });

  // POST /api/menu/categories
  app.post('/', {
    preHandler: [authenticate, requireRole(['owner', 'manager'])],
  }, async (req, reply) => {
    const { store_id, sub: user_id } = req.user as JWTPayload;
    const parsed = CategoryCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'INVALID_BODY', issues: parsed.error.issues });
    }
    const data = parsed.data;

    try {
      const [row] = await db.insert(menu_categories).values({
        store_id,
        name:        data.name,
        icon:        data.icon,
        sort_order:  data.sort_order,
        is_active:   data.is_active,
        external_id: data.external_id,
      }).returning();

      await logAudit({
        store_id, entity_type: 'menu_category', entity_id: row.id,
        operation: 'create', user_id, after: row as unknown as Record<string, unknown>,
      }, req.log);

      await invalidateSnapshot(store_id);  // AM01-013

      broadcast(store_id, 'display:full_refresh', { reason: 'category_added' },
        (c) => c.device_type === 'tablet' || (c.device_type === 'tv' && c.role === 'menu'));

      return reply.status(201).send(row);
    } catch (err) {
      // BR-26: (store_id, external_id) partial unique
      if ((err as { code?: string }).code === '23505') {
        return reply.status(409).send({ error: 'EXTERNAL_ID_CONFLICT' });
      }
      throw err;
    }
  });

  // PATCH /api/menu/categories/:id
  app.patch<{ Params: { id: string } }>('/:id', {
    preHandler: [authenticate, requireRole(['owner', 'manager'])],
  }, async (req, reply) => {
    const { store_id, sub: user_id } = req.user as JWTPayload;
    const { id } = req.params;
    const parsed = CategoryUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'INVALID_BODY', issues: parsed.error.issues });
    }

    const [before] = await db.select().from(menu_categories)
      .where(and(eq(menu_categories.store_id, store_id), eq(menu_categories.id, id), isNull(menu_categories.deleted_at)))
      .limit(1);
    if (!before) return reply.status(404).send({ error: 'CATEGORY_NOT_FOUND' });

    const [updated] = await db.update(menu_categories)
      .set({ ...parsed.data, updated_at: new Date() })
      .where(and(eq(menu_categories.store_id, store_id), eq(menu_categories.id, id), isNull(menu_categories.deleted_at)))
      .returning();
    if (!updated) return reply.status(404).send({ error: 'CATEGORY_NOT_FOUND' });

    await logAudit({
      store_id, entity_type: 'menu_category', entity_id: id, operation: 'update',
      user_id, before: before as unknown as Record<string, unknown>,
      after: updated as unknown as Record<string, unknown>,
    }, req.log);

    await invalidateSnapshot(store_id);  // AM01-013

    broadcast(store_id, 'display:full_refresh', { reason: 'category_updated' },
      (c) => c.device_type === 'tablet' || (c.device_type === 'tv' && c.role === 'menu'));

    return reply.send(updated);
  });

  // PATCH /api/menu/categories/reorder — bulk sort_order update
  app.patch('/reorder', {
    preHandler: [authenticate, requireRole(['owner', 'manager'])],
  }, async (req, reply) => {
    const { store_id, sub: user_id } = req.user as JWTPayload;
    const parsed = CategoryReorderSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'INVALID_BODY', issues: parsed.error.issues });
    }

    const ids = parsed.data.orders.map((o) => o.id);
    const owned = await db.select({ id: menu_categories.id })
      .from(menu_categories)
      .where(and(eq(menu_categories.store_id, store_id), isNull(menu_categories.deleted_at)));
    const ownedSet = new Set(owned.map((o) => o.id));
    for (const id of ids) {
      if (!ownedSet.has(id)) return reply.status(404).send({ error: 'CATEGORY_NOT_FOUND', id });
    }

    await db.transaction(async (tx) => {
      for (const { id, sort_order } of parsed.data.orders) {
        await tx.update(menu_categories)
          .set({ sort_order, updated_at: new Date() })
          .where(and(eq(menu_categories.store_id, store_id), eq(menu_categories.id, id)));
      }
    });

    await logAudit({
      store_id, entity_type: 'menu_category', entity_id: ids[0],
      operation: 'reorder', user_id,
      after: { orders: parsed.data.orders },
    }, req.log);

    await invalidateSnapshot(store_id);  // AM01-013

    broadcast(store_id, 'display:category_reordered', { orders: parsed.data.orders },
      (c) => c.device_type === 'tablet' || (c.device_type === 'tv' && c.role === 'menu'));

    return reply.send({ updated: parsed.data.orders.length });
  });

  // DELETE /api/menu/categories/:id (soft + BR-14 차단)
  app.delete<{ Params: { id: string } }>('/:id', {
    preHandler: [authenticate, requireRole(['owner', 'manager'])],
  }, async (req, reply) => {
    const { store_id, sub: user_id } = req.user as JWTPayload;
    const { id } = req.params;

    const [before] = await db.select().from(menu_categories)
      .where(and(eq(menu_categories.store_id, store_id), eq(menu_categories.id, id), isNull(menu_categories.deleted_at)))
      .limit(1);
    if (!before) return reply.status(404).send({ error: 'CATEGORY_NOT_FOUND' });

    // BR-14: 연결된 menu_items가 있으면 차단
    const [{ n }] = await db.select({ n: count() }).from(menu_items)
      .where(and(eq(menu_items.store_id, store_id), eq(menu_items.category_id, id), isNull(menu_items.deleted_at)));
    if (n > 0) {
      return reply.status(409).send({
        error: 'CATEGORY_IN_USE',
        item_count: n,
        message: 'Move items to another category before deleting (BR-14).',
      });
    }

    const now = new Date();
    await db.update(menu_categories)
      .set({ deleted_at: now, updated_at: now })
      .where(and(eq(menu_categories.store_id, store_id), eq(menu_categories.id, id), isNull(menu_categories.deleted_at)));

    await logAudit({
      store_id, entity_type: 'menu_category', entity_id: id, operation: 'delete',
      user_id, before: before as unknown as Record<string, unknown>,
    }, req.log);

    await invalidateSnapshot(store_id);  // AM01-013

    broadcast(store_id, 'display:full_refresh', { reason: 'category_deleted' },
      (c) => c.device_type === 'tablet' || (c.device_type === 'tv' && c.role === 'menu'));

    return reply.status(204).send();
  });
};

export default categoriesPlugin;
