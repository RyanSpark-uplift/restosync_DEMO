// Sprint 4 S4.6 — Menu Item Recipe (item ↔ ingredient N:M)
// PRD M01 v1.2 §3.2 #6 / §5.4.
// PUT 전체 교체 1tx — RecipePutSchema 검증 후 DELETE all + INSERT all.
//
// AG-001 store_id WHERE / AG-009 /api prefix (registered at /api/menu)
// AG-013 unit enum 정본 / AG-018 (store_id,item_id,ingredient_id) unique
// AG-023 + AM01-013 invalidate(await) → broadcast 순서
// AM01-014 menu 이벤트는 TV(menu) + 모든 Tablet 양쪽
// BR-20 sync_source != 'restosync' → 403

import type { FastifyPluginAsync } from 'fastify';
import { eq, and, isNull, asc, inArray } from 'drizzle-orm';
import { db } from '../db/db';
import { menu_items, menu_ingredients, menu_item_ingredients } from '../db/schema';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { broadcast } from '../ws/broadcast';
import { logAudit } from '../services/audit';
import { invalidateSnapshot } from '../services/menuSnapshot';
import type { JWTPayload } from '../types';
import { RecipePutSchema } from '../schemas/menu';

const menuFilter = (c: { device_type: string; role?: string }) =>
  c.device_type === 'tablet' || (c.device_type === 'tv' && c.role === 'menu');

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

const itemIngredientsPlugin: FastifyPluginAsync = async (app) => {

  // ── GET /api/menu/items/:id/ingredients ───────────────────────────────────
  // Returns recipe lines joined with ingredient (name + unit + stock 표시용).
  app.get<{ Params: { id: string } }>('/items/:id/ingredients', {
    preHandler: authenticate,
  }, async (req, reply) => {
    const { store_id } = req.user as JWTPayload;
    const { id: item_id } = req.params;

    const item = await getOwnedItem(store_id, item_id);
    if (!item) return reply.status(404).send({ error: 'ITEM_NOT_FOUND' });

    const rows = await db
      .select({
        ingredient_id:   menu_item_ingredients.ingredient_id,
        quantity:        menu_item_ingredients.quantity,
        unit:            menu_item_ingredients.unit,
        sort_order:      menu_item_ingredients.sort_order,
        created_at:      menu_item_ingredients.created_at,
        ingredient_name: menu_ingredients.name,
        ingredient_unit: menu_ingredients.unit,
        stock_quantity:  menu_ingredients.stock_quantity,
        min_threshold:   menu_ingredients.min_threshold,
      })
      .from(menu_item_ingredients)
      .innerJoin(menu_ingredients, and(
        eq(menu_ingredients.id, menu_item_ingredients.ingredient_id),
        eq(menu_ingredients.store_id, store_id),
        isNull(menu_ingredients.deleted_at),
      ))
      .where(and(
        eq(menu_item_ingredients.store_id, store_id),
        eq(menu_item_ingredients.item_id, item_id),
      ))
      .orderBy(asc(menu_item_ingredients.sort_order), asc(menu_item_ingredients.created_at), asc(menu_item_ingredients.ingredient_id));

    return reply.send(rows);
  });

  // ── PUT /api/menu/items/:id/recipe ────────────────────────────────────────
  // 전체 교체 1tx. 빈 배열 = recipe 전체 삭제.
  app.put<{ Params: { id: string } }>('/items/:id/recipe', {
    preHandler: [authenticate, requireRole(['owner', 'manager'])],
  }, async (req, reply) => {
    const { store_id, sub: user_id } = req.user as JWTPayload;
    const { id: item_id } = req.params;

    const parsed = RecipePutSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'INVALID_BODY', issues: parsed.error.issues });
    }
    const { lines } = parsed.data;

    const item = await getOwnedItem(store_id, item_id);
    if (!item) return reply.status(404).send({ error: 'ITEM_NOT_FOUND' });

    // BR-20 — POS-mastered items are read-only.
    if (item.sync_source !== 'restosync') {
      return reply.status(403).send({
        error: 'EXTERNAL_SYNC_LOCKED',
        sync_source: item.sync_source,
        message: 'Item is mastered by external POS. Edit recipe in source system or detach sync.',
      });
    }

    // Validate all ingredient_ids belong to this store and are not soft-deleted.
    if (lines.length > 0) {
      const ingredientIds = lines.map((l) => l.ingredient_id);
      const owned = await db
        .select({ id: menu_ingredients.id })
        .from(menu_ingredients)
        .where(and(
          eq(menu_ingredients.store_id, store_id),
          inArray(menu_ingredients.id, ingredientIds),
          isNull(menu_ingredients.deleted_at),
        ));
      if (owned.length !== ingredientIds.length) {
        return reply.status(422).send({
          error: 'INGREDIENT_NOT_FOUND',
          message: 'one or more ingredient_id not found in this store',
        });
      }
    }

    const before = await db.select().from(menu_item_ingredients)
      .where(and(
        eq(menu_item_ingredients.store_id, store_id),
        eq(menu_item_ingredients.item_id, item_id),
      ));

    const after = await db.transaction(async (tx) => {
      await tx.delete(menu_item_ingredients)
        .where(and(
          eq(menu_item_ingredients.store_id, store_id),
          eq(menu_item_ingredients.item_id, item_id),
        ));

      if (lines.length === 0) return [];

      const inserted = await tx.insert(menu_item_ingredients).values(
        lines.map((l) => ({
          store_id,
          item_id,
          ingredient_id: l.ingredient_id,
          quantity:      l.quantity,
          unit:          l.unit,
          sort_order:    l.sort_order,
        })),
      ).returning();
      return inserted;
    });

    await logAudit({
      store_id, entity_type: 'menu_item', entity_id: item_id,
      operation: 'update', user_id,
      reason: 'recipe_replace',
      before: { recipe: before as unknown as Record<string, unknown>[] },
      after:  { recipe: after as unknown as Record<string, unknown>[] },
    }, req.log);

    await invalidateSnapshot(store_id);  // AM01-013

    broadcast(store_id, 'display:menu_item_updated', { item }, menuFilter);

    return reply.send({ item_id, lines: after });
  });
};

export default itemIngredientsPlugin;
