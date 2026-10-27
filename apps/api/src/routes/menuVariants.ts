// Sprint 4 S4.5b — Menu Variants CRUD (M01 PRD v1.2 §5.2, BR-16/20)
// AG-001 store_id WHERE / AG-009 /api prefix (registered at /api/menu) / AG-013 정본 enum
// AG-018 BR-26 no external_id here / AG-023 broadcast은 commit 후
// BR-16 effective price = items.price_cents + price_delta_cents
// BR-20 sync_source != 'restosync' → 403 (variant editing locked when item is POS-managed)
// AM01-010 update WHERE에 isNull(deleted_at) 유지
// AM01-013 invalidate(await) → broadcast 순서
// AM01-014 menu 이벤트는 TV(menu) + 모든 Tablet 양쪽 broadcast
//
// has_variants 자동 동기화:
//   - POST(첫 active variant) → menu_items.has_variants=true
//   - DELETE(마지막 active variant 제거) → has_variants=false

import type { FastifyPluginAsync } from 'fastify';
import { eq, and, isNull, ne, asc, count } from 'drizzle-orm';
import { db } from '../db/db';
import { menu_items, menu_variants } from '../db/schema';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { broadcast } from '../ws/broadcast';
import { logAudit } from '../services/audit';
import { invalidateSnapshot } from '../services/menuSnapshot';
import type { JWTPayload } from '../types';
import { VariantCreateSchema, VariantUpdateSchema } from '../schemas/menu';

// Menu-event broadcast filter (AM01-014).
const menuFilter = (c: { device_type: string; role?: string }) =>
  c.device_type === 'tablet' || (c.device_type === 'tv' && c.role === 'menu');

// Fetch item with store_id guard. Returns null when not found / cross-store / soft-deleted.
async function getOwnedItem(store_id: string, item_id: string) {
  const [row] = await db.select().from(menu_items)
    .where(and(
      eq(menu_items.store_id, store_id),
      eq(menu_items.id, item_id),
      isNull(menu_items.deleted_at),
    ))
    .limit(1);
  return row ?? null;
}

const variantsPlugin: FastifyPluginAsync = async (app) => {

  // GET /api/menu/items/:id/variants
  app.get<{ Params: { id: string } }>('/items/:id/variants', {
    preHandler: authenticate,
  }, async (req, reply) => {
    const { store_id } = req.user as JWTPayload;
    const { id: item_id } = req.params;

    const item = await getOwnedItem(store_id, item_id);
    if (!item) return reply.status(404).send({ error: 'ITEM_NOT_FOUND' });

    const rows = await db.select().from(menu_variants)
      .where(and(
        eq(menu_variants.store_id, store_id),
        eq(menu_variants.item_id, item_id),
        isNull(menu_variants.deleted_at),
      ))
      .orderBy(asc(menu_variants.sort_order), asc(menu_variants.created_at), asc(menu_variants.id));

    return reply.send(rows);
  });

  // POST /api/menu/items/:id/variants
  app.post<{ Params: { id: string } }>('/items/:id/variants', {
    preHandler: [authenticate, requireRole(['owner', 'manager'])],
  }, async (req, reply) => {
    const { store_id, sub: user_id } = req.user as JWTPayload;
    const { id: item_id } = req.params;

    const parsed = VariantCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'INVALID_BODY', issues: parsed.error.issues });
    }
    const data = parsed.data;

    const item = await getOwnedItem(store_id, item_id);
    if (!item) return reply.status(404).send({ error: 'ITEM_NOT_FOUND' });

    // BR-20 — POS-managed items are read-only for restosync mutations.
    if (item.sync_source !== 'restosync') {
      return reply.status(403).send({
        error: 'EXTERNAL_SYNC_LOCKED',
        sync_source: item.sync_source,
        message: 'Item is mastered by external POS. Modify variants in source system or detach sync.',
      });
    }

    // Single transaction: optionally clear prior defaults + insert variant + flip has_variants.
    const { variant, updatedItem } = await db.transaction(async (tx) => {
      if (data.is_default) {
        await tx.update(menu_variants)
          .set({ is_default: false, updated_at: new Date() })
          .where(and(
            eq(menu_variants.store_id, store_id),
            eq(menu_variants.item_id, item_id),
            eq(menu_variants.is_default, true),
            isNull(menu_variants.deleted_at),
          ));
      }

      const [inserted] = await tx.insert(menu_variants).values({
        store_id,
        item_id,
        name:              data.name,
        price_delta_cents: data.price_delta_cents,
        is_default:        data.is_default,
        sort_order:        data.sort_order,
      }).returning();

      let updated = item;
      if (!item.has_variants) {
        const [u] = await tx.update(menu_items)
          .set({ has_variants: true, updated_at: new Date() })
          .where(and(
            eq(menu_items.store_id, store_id),
            eq(menu_items.id, item_id),
            isNull(menu_items.deleted_at),
          ))
          .returning();
        if (u) updated = u;
      }
      return { variant: inserted, updatedItem: updated };
    });

    await logAudit({
      store_id, entity_type: 'menu_variant', entity_id: variant.id,
      operation: 'create', user_id,
      after: variant as unknown as Record<string, unknown>,
    }, req.log);

    await invalidateSnapshot(store_id);  // AM01-013

    broadcast(store_id, 'display:variant_toggled',
      { item_id, variant_id: variant.id, action: 'created' }, menuFilter);
    broadcast(store_id, 'display:menu_item_updated', { item: updatedItem }, menuFilter);

    return reply.status(201).send(variant);
  });

  // PATCH /api/menu/items/:id/variants/:variant_id
  app.patch<{ Params: { id: string; variant_id: string } }>(
    '/items/:id/variants/:variant_id',
    { preHandler: [authenticate, requireRole(['owner', 'manager'])] },
    async (req, reply) => {
      const { store_id, sub: user_id } = req.user as JWTPayload;
      const { id: item_id, variant_id } = req.params;

      const parsed = VariantUpdateSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: 'INVALID_BODY', issues: parsed.error.issues });
      }
      const data = parsed.data;
      if (Object.keys(data).length === 0) {
        return reply.status(400).send({ error: 'EMPTY_PATCH' });
      }

      const item = await getOwnedItem(store_id, item_id);
      if (!item) return reply.status(404).send({ error: 'ITEM_NOT_FOUND' });

      if (item.sync_source !== 'restosync') {
        return reply.status(403).send({
          error: 'EXTERNAL_SYNC_LOCKED',
          sync_source: item.sync_source,
          message: 'Item is mastered by external POS. Modify variants in source system or detach sync.',
        });
      }

      const [before] = await db.select().from(menu_variants)
        .where(and(
          eq(menu_variants.store_id, store_id),
          eq(menu_variants.item_id, item_id),
          eq(menu_variants.id, variant_id),
          isNull(menu_variants.deleted_at),
        ))
        .limit(1);
      if (!before) return reply.status(404).send({ error: 'VARIANT_NOT_FOUND' });

      const updated = await db.transaction(async (tx) => {
        if (data.is_default === true) {
          // Clear other defaults within the same item before promoting this one.
          await tx.update(menu_variants)
            .set({ is_default: false, updated_at: new Date() })
            .where(and(
              eq(menu_variants.store_id, store_id),
              eq(menu_variants.item_id, item_id),
              eq(menu_variants.is_default, true),
              ne(menu_variants.id, variant_id),
              isNull(menu_variants.deleted_at),
            ));
        }

        const [row] = await tx.update(menu_variants)
          .set({ ...data, updated_at: new Date() })
          .where(and(
            eq(menu_variants.store_id, store_id),
            eq(menu_variants.item_id, item_id),
            eq(menu_variants.id, variant_id),
            isNull(menu_variants.deleted_at),
          ))
          .returning();
        return row;
      });
      if (!updated) return reply.status(404).send({ error: 'VARIANT_NOT_FOUND' });

      await logAudit({
        store_id, entity_type: 'menu_variant', entity_id: variant_id,
        operation: 'update', user_id,
        before: before as unknown as Record<string, unknown>,
        after: updated as unknown as Record<string, unknown>,
      }, req.log);

      await invalidateSnapshot(store_id);

      broadcast(store_id, 'display:variant_toggled',
        { item_id, variant_id, action: 'updated' }, menuFilter);
      broadcast(store_id, 'display:menu_item_updated', { item }, menuFilter);

      return reply.send(updated);
    },
  );

  // DELETE /api/menu/items/:id/variants/:variant_id (soft)
  app.delete<{ Params: { id: string; variant_id: string } }>(
    '/items/:id/variants/:variant_id',
    { preHandler: [authenticate, requireRole(['owner', 'manager'])] },
    async (req, reply) => {
      const { store_id, sub: user_id } = req.user as JWTPayload;
      const { id: item_id, variant_id } = req.params;

      const item = await getOwnedItem(store_id, item_id);
      if (!item) return reply.status(404).send({ error: 'ITEM_NOT_FOUND' });

      if (item.sync_source !== 'restosync') {
        return reply.status(403).send({
          error: 'EXTERNAL_SYNC_LOCKED',
          sync_source: item.sync_source,
          message: 'Item is mastered by external POS. Modify variants in source system or detach sync.',
        });
      }

      const [before] = await db.select().from(menu_variants)
        .where(and(
          eq(menu_variants.store_id, store_id),
          eq(menu_variants.item_id, item_id),
          eq(menu_variants.id, variant_id),
          isNull(menu_variants.deleted_at),
        ))
        .limit(1);
      if (!before) return reply.status(404).send({ error: 'VARIANT_NOT_FOUND' });

      // Soft delete + recompute has_variants in single tx.
      const { updatedItem } = await db.transaction(async (tx) => {
        const now = new Date();
        await tx.update(menu_variants)
          .set({ deleted_at: now, updated_at: now })
          .where(and(
            eq(menu_variants.store_id, store_id),
            eq(menu_variants.item_id, item_id),
            eq(menu_variants.id, variant_id),
            isNull(menu_variants.deleted_at),
          ));

        const [{ n }] = await tx.select({ n: count() }).from(menu_variants)
          .where(and(
            eq(menu_variants.store_id, store_id),
            eq(menu_variants.item_id, item_id),
            isNull(menu_variants.deleted_at),
          ));

        let updated = item;
        if (Number(n) === 0 && item.has_variants) {
          const [u] = await tx.update(menu_items)
            .set({ has_variants: false, updated_at: new Date() })
            .where(and(
              eq(menu_items.store_id, store_id),
              eq(menu_items.id, item_id),
              isNull(menu_items.deleted_at),
            ))
            .returning();
          if (u) updated = u;
        }
        return { updatedItem: updated };
      });

      await logAudit({
        store_id, entity_type: 'menu_variant', entity_id: variant_id,
        operation: 'delete', user_id,
        before: before as unknown as Record<string, unknown>,
      }, req.log);

      await invalidateSnapshot(store_id);

      broadcast(store_id, 'display:variant_toggled',
        { item_id, variant_id, action: 'deleted' }, menuFilter);
      broadcast(store_id, 'display:menu_item_updated', { item: updatedItem }, menuFilter);

      return reply.status(204).send();
    },
  );
};

export default variantsPlugin;
