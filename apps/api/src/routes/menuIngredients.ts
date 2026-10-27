// Sprint 4 S4.6 — Menu Ingredients CRUD + stock-adjust (M01 PRD v1.2 §3.9, §5.4)
// P1.5 prep — BR-19 자동 sold_out 작업은 worker에서 후속 (재고 + recipe × 5 미만).
//
// AG-001 store_id WHERE / AG-009 /api prefix (registered at /api/menu/ingredients)
// AG-013 unit enum 정본 (INGREDIENT_UNIT 9-value, CHECK constraint)
// AG-018 BR-26 (store_id, external_id) partial unique → 409 mapping
// AG-021 server-side filter + 200 default / 500 max limit
// AG-023 broadcast은 commit 후
// AM01-010 update WHERE에 isNull(deleted_at)
// AM01-013 invalidate(await) → broadcast 순서
// AM01-014 menu 이벤트는 TV(menu) + 모든 Tablet 양쪽
//
// RBAC:
//   owner/manager  full CRUD + stock-adjust(set/delta)
//   kitchen        stock-adjust(delta) only — 재고 차감/보충
//   staff          read only
// Note: BR-20 sync_source — ingredients는 매장 자체 자산이므로 미적용 (POS lock 없음).

import type { FastifyPluginAsync } from 'fastify';
import { eq, and, isNull, asc, desc, ilike, lt, sql, count } from 'drizzle-orm';
import { db } from '../db/db';
import { menu_ingredients, menu_item_ingredients } from '../db/schema';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { broadcast } from '../ws/broadcast';
import { logAudit } from '../services/audit';
import type { JWTPayload } from '../types';
import {
  IngredientCreateSchema,
  IngredientUpdateSchema,
  IngredientListQuerySchema,
  StockAdjustSchema,
} from '../schemas/menu';

// Menu-event broadcast filter (AM01-014).
const menuFilter = (c: { device_type: string; role?: string }) =>
  c.device_type === 'tablet' || (c.device_type === 'tv' && c.role === 'menu');

const ingredientsPlugin: FastifyPluginAsync = async (app) => {

  // ── GET /api/menu/ingredients ──────────────────────────────────────────────
  app.get('/', { preHandler: authenticate }, async (req, reply) => {
    const { store_id } = req.user as JWTPayload;

    const parsed = IngredientListQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'INVALID_QUERY', issues: parsed.error.issues });
    }
    const q = parsed.data;

    const conds = [
      eq(menu_ingredients.store_id, store_id),
      isNull(menu_ingredients.deleted_at),
    ];
    if (q.unit) conds.push(eq(menu_ingredients.unit, q.unit));
    if (q.low_stock) {
      // stock < min_threshold (min_threshold NULL는 제외)
      conds.push(lt(menu_ingredients.stock_quantity, menu_ingredients.min_threshold));
    }
    if (q.search) {
      // name_i18n.en ILIKE — jsonb 텍스트 추출
      conds.push(sql`(${menu_ingredients.name}->>'en') ILIKE ${'%' + q.search + '%'}`);
    }

    const rows = await db.select().from(menu_ingredients)
      .where(and(...conds))
      .orderBy(asc(sql`${menu_ingredients.name}->>'en'`), desc(menu_ingredients.created_at), asc(menu_ingredients.id))
      .limit(q.limit)
      .offset(q.offset);

    return reply.send(rows);
  });

  // ── GET /api/menu/ingredients/:id ──────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/:id', { preHandler: authenticate }, async (req, reply) => {
    const { store_id } = req.user as JWTPayload;
    const { id } = req.params;

    const [row] = await db.select().from(menu_ingredients)
      .where(and(
        eq(menu_ingredients.store_id, store_id),
        eq(menu_ingredients.id, id),
        isNull(menu_ingredients.deleted_at),
      ))
      .limit(1);
    if (!row) return reply.status(404).send({ error: 'INGREDIENT_NOT_FOUND' });
    return reply.send(row);
  });

  // ── POST /api/menu/ingredients ─────────────────────────────────────────────
  app.post('/', {
    preHandler: [authenticate, requireRole(['owner', 'manager'])],
  }, async (req, reply) => {
    const { store_id, sub: user_id } = req.user as JWTPayload;

    const parsed = IngredientCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'INVALID_BODY', issues: parsed.error.issues });
    }
    const data = parsed.data;

    try {
      const [inserted] = await db.insert(menu_ingredients).values({
        store_id,
        name:            data.name,
        unit:            data.unit,
        stock_quantity:  data.stock_quantity ?? '0',
        min_threshold:   data.min_threshold ?? null,
        external_id:     data.external_id ?? null,
      }).returning();

      await logAudit({
        store_id, entity_type: 'menu_ingredient', entity_id: inserted.id,
        operation: 'create', user_id,
        after: inserted as unknown as Record<string, unknown>,
      }, req.log);

      // No broadcast for catalog-only changes (no item affected yet).
      return reply.status(201).send(inserted);
    } catch (err: unknown) {
      // BR-26 external_id 충돌 (partial unique)
      if ((err as { code?: string })?.code === '23505') {
        return reply.status(409).send({ error: 'EXTERNAL_ID_CONFLICT' });
      }
      throw err;
    }
  });

  // ── PATCH /api/menu/ingredients/:id ────────────────────────────────────────
  app.patch<{ Params: { id: string } }>('/:id', {
    preHandler: [authenticate, requireRole(['owner', 'manager'])],
  }, async (req, reply) => {
    const { store_id, sub: user_id } = req.user as JWTPayload;
    const { id } = req.params;

    const parsed = IngredientUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'INVALID_BODY', issues: parsed.error.issues });
    }
    const data = parsed.data;
    if (Object.keys(data).length === 0) {
      return reply.status(400).send({ error: 'EMPTY_PATCH' });
    }

    const [before] = await db.select().from(menu_ingredients)
      .where(and(
        eq(menu_ingredients.store_id, store_id),
        eq(menu_ingredients.id, id),
        isNull(menu_ingredients.deleted_at),
      ))
      .limit(1);
    if (!before) return reply.status(404).send({ error: 'INGREDIENT_NOT_FOUND' });

    try {
      const [updated] = await db.update(menu_ingredients)
        .set({ ...data, updated_at: new Date() })
        .where(and(
          eq(menu_ingredients.store_id, store_id),
          eq(menu_ingredients.id, id),
          isNull(menu_ingredients.deleted_at),
        ))
        .returning();
      if (!updated) return reply.status(404).send({ error: 'INGREDIENT_NOT_FOUND' });

      await logAudit({
        store_id, entity_type: 'menu_ingredient', entity_id: id,
        operation: 'update', user_id,
        before: before as unknown as Record<string, unknown>,
        after: updated as unknown as Record<string, unknown>,
      }, req.log);

      // Unit change can affect attached recipes' display — signal full refresh.
      if (data.unit && data.unit !== before.unit) {
        broadcast(store_id, 'display:full_refresh', {}, menuFilter);
      }

      return reply.send(updated);
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === '23505') {
        return reply.status(409).send({ error: 'EXTERNAL_ID_CONFLICT' });
      }
      throw err;
    }
  });

  // ── PATCH /api/menu/ingredients/:id/stock-adjust ───────────────────────────
  // kitchen 권한 허용 (재고 차감). delta는 음수 가능. stock_quantity는 CHECK >= 0.
  app.patch<{ Params: { id: string } }>('/:id/stock-adjust', {
    preHandler: [authenticate, requireRole(['owner', 'manager', 'kitchen'])],
  }, async (req, reply) => {
    const { store_id, sub: user_id, role } = req.user as JWTPayload;
    const { id } = req.params;

    const parsed = StockAdjustSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'INVALID_BODY', issues: parsed.error.issues });
    }
    const body = parsed.data;

    // kitchen role은 'set'(절대값) 금지 — delta만 허용
    if (role === 'kitchen' && body.mode === 'set') {
      return reply.status(403).send({
        error: 'FORBIDDEN_MODE',
        message: 'kitchen role can only use mode=delta for stock-adjust',
      });
    }

    const [before] = await db.select().from(menu_ingredients)
      .where(and(
        eq(menu_ingredients.store_id, store_id),
        eq(menu_ingredients.id, id),
        isNull(menu_ingredients.deleted_at),
      ))
      .limit(1);
    if (!before) return reply.status(404).send({ error: 'INGREDIENT_NOT_FOUND' });

    let updated: typeof before | undefined;
    try {
      if (body.mode === 'set') {
        [updated] = await db.update(menu_ingredients)
          .set({ stock_quantity: body.value, updated_at: new Date() })
          .where(and(
            eq(menu_ingredients.store_id, store_id),
            eq(menu_ingredients.id, id),
            isNull(menu_ingredients.deleted_at),
          ))
          .returning();
      } else {
        // delta: SQL expression to keep atomicity
        [updated] = await db.update(menu_ingredients)
          .set({
            stock_quantity: sql`${menu_ingredients.stock_quantity} + ${body.delta}::numeric`,
            updated_at:     new Date(),
          })
          .where(and(
            eq(menu_ingredients.store_id, store_id),
            eq(menu_ingredients.id, id),
            isNull(menu_ingredients.deleted_at),
          ))
          .returning();
      }
    } catch (err: unknown) {
      // CHECK stock_quantity >= 0 violation
      if ((err as { code?: string })?.code === '23514') {
        return reply.status(422).send({ error: 'NEGATIVE_STOCK_REJECTED' });
      }
      throw err;
    }

    if (!updated) return reply.status(404).send({ error: 'INGREDIENT_NOT_FOUND' });

    await logAudit({
      store_id, entity_type: 'menu_ingredient', entity_id: id,
      operation: 'update', user_id,
      reason: body.mode === 'delta' ? body.reason ?? 'stock_delta' : 'stock_set',
      before: { stock_quantity: before.stock_quantity },
      after:  { stock_quantity: updated.stock_quantity },
    }, req.log);

    // BR-19 — low-stock signal (worker가 menu_items.sold_out 적용은 P1.5 후속)
    if (updated.min_threshold !== null && Number(updated.stock_quantity) < Number(updated.min_threshold)) {
      broadcast(store_id, 'display:ingredient_low', {
        ingredient_id: id,
        stock_quantity: updated.stock_quantity,
        min_threshold: updated.min_threshold,
      }, menuFilter);
    }

    return reply.send(updated);
  });

  // ── DELETE /api/menu/ingredients/:id (soft) ────────────────────────────────
  app.delete<{ Params: { id: string } }>('/:id', {
    preHandler: [authenticate, requireRole(['owner', 'manager'])],
  }, async (req, reply) => {
    const { store_id, sub: user_id } = req.user as JWTPayload;
    const { id } = req.params;

    const [before] = await db.select().from(menu_ingredients)
      .where(and(
        eq(menu_ingredients.store_id, store_id),
        eq(menu_ingredients.id, id),
        isNull(menu_ingredients.deleted_at),
      ))
      .limit(1);
    if (!before) return reply.status(404).send({ error: 'INGREDIENT_NOT_FOUND' });

    // Block deletion when ingredient is still referenced by any recipe (FK is RESTRICT,
    // but soft-delete bypasses FK — enforce manually to keep cascade semantics consistent).
    const [{ n }] = await db.select({ n: count() }).from(menu_item_ingredients)
      .where(and(
        eq(menu_item_ingredients.store_id, store_id),
        eq(menu_item_ingredients.ingredient_id, id),
      ));
    if (Number(n) > 0) {
      return reply.status(409).send({
        error: 'INGREDIENT_IN_USE',
        recipe_count: Number(n),
        message: 'Ingredient is used in recipes. Remove from recipes first.',
      });
    }

    const now = new Date();
    await db.update(menu_ingredients)
      .set({ deleted_at: now, updated_at: now })
      .where(and(
        eq(menu_ingredients.store_id, store_id),
        eq(menu_ingredients.id, id),
        isNull(menu_ingredients.deleted_at),
      ));

    await logAudit({
      store_id, entity_type: 'menu_ingredient', entity_id: id,
      operation: 'delete', user_id,
      before: before as unknown as Record<string, unknown>,
    }, req.log);

    return reply.status(204).send();
  });
};

export default ingredientsPlugin;
