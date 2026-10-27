// Sprint G.A — Combos routes (PRD §4.2 Page G / §5.1 / BR-18/23)
// GET    /api/menu/combos          → list (auth)
// GET    /api/menu/combos/:id      → single with items (auth)
// POST   /api/menu/combos          → create (owner/manager, BR-23 enforce 422)
// PATCH  /api/menu/combos/:id      → update (owner/manager, BR-23 re-validate)
// DELETE /api/menu/combos/:id      → soft delete (owner/manager)
//
// AG-001 store_id JWT only / AG-009 /api prefix / AG-013 DAYPART 정본
// AG-018 (store_id, combo_id, item_id) unique / BR-05 soft delete / BR-18 substitutable
// AG-023 commit → invalidateSnapshot → broadcast 순서 (AM01-013)

import type { FastifyPluginAsync } from 'fastify';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../db/db';
import { menu_combos, menu_combo_items, menu_items } from '../db/schema';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { broadcast } from '../ws/broadcast';
import { logAudit } from '../services/audit';
import { invalidateSnapshot } from '../services/menuSnapshot';
import {
  ComboCreateSchema,
  ComboPatchSchema,
  ComboListQuerySchema,
} from '../schemas/menu';
import type { JWTPayload } from '../types';

type ComboItemRow = {
  item_id: string;
  quantity: number;
  is_substitutable: boolean;
  group_name: string | null;
  sort_order: number;
};

// price_cents × qty per line. Returns null if any item is missing/cross-store/soft-deleted.
async function resolveItemsTotal(
  storeId: string,
  lines: { item_id: string; quantity: number }[],
): Promise<{ ok: true; total: number } | { ok: false; missing: string[] }> {
  const ids = lines.map((l) => l.item_id);
  const rows = await db.select({
    id: menu_items.id,
    price_cents: menu_items.price_cents,
    deleted_at: menu_items.deleted_at,
  }).from(menu_items)
    .where(and(eq(menu_items.store_id, storeId), inArray(menu_items.id, ids)));

  const byId = new Map(rows.filter((r) => r.deleted_at == null).map((r) => [r.id, r.price_cents]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length > 0) return { ok: false, missing };

  let total = 0;
  for (const line of lines) {
    const price = byId.get(line.item_id);
    if (price == null) return { ok: false, missing: [line.item_id] };  // legacy item without price_cents
    total += price * line.quantity;
  }
  return { ok: true, total };
}

async function loadComboWithItems(storeId: string, comboId: string) {
  const [combo] = await db.select().from(menu_combos)
    .where(and(eq(menu_combos.store_id, storeId), eq(menu_combos.id, comboId)))
    .limit(1);
  if (!combo) return null;
  const items = await db.select({
    item_id:          menu_combo_items.item_id,
    quantity:         menu_combo_items.quantity,
    is_substitutable: menu_combo_items.is_substitutable,
    group_name:       menu_combo_items.group_name,
    sort_order:       menu_combo_items.sort_order,
  }).from(menu_combo_items)
    .where(and(
      eq(menu_combo_items.store_id, storeId),
      eq(menu_combo_items.combo_id, comboId),
    ))
    .orderBy(asc(menu_combo_items.sort_order), asc(menu_combo_items.item_id));
  return { ...combo, items };
}

const combosPlugin: FastifyPluginAsync = async (app) => {

  // ── GET /api/menu/combos ────────────────────────────────────────────────────
  app.get('/', { preHandler: authenticate }, async (req, reply) => {
    const { store_id } = req.user as JWTPayload;
    const parsed = ComboListQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.status(422).send({ error: 'INVALID_QUERY', issues: parsed.error.issues });
    }
    const { daypart, status, limit } = parsed.data;

    const conds = [eq(menu_combos.store_id, store_id), isNull(menu_combos.deleted_at)];
    if (status === 'active')   conds.push(eq(menu_combos.is_sold_out, false));
    if (status === 'sold_out') conds.push(eq(menu_combos.is_sold_out, true));
    if (daypart) {
      // dayparts_arr && [daypart, 'all'] overlap
      conds.push(sql`${menu_combos.dayparts_arr} && ARRAY[${daypart}, 'all']::text[]`);
    }

    const combos = await db.select().from(menu_combos)
      .where(and(...conds))
      .orderBy(asc(menu_combos.sort_order), asc(menu_combos.id))
      .limit(limit);

    if (combos.length === 0) return reply.send({ combos: [] });

    const items = await db.select({
      combo_id:         menu_combo_items.combo_id,
      item_id:          menu_combo_items.item_id,
      quantity:         menu_combo_items.quantity,
      is_substitutable: menu_combo_items.is_substitutable,
      group_name:       menu_combo_items.group_name,
      sort_order:       menu_combo_items.sort_order,
    }).from(menu_combo_items)
      .where(and(
        eq(menu_combo_items.store_id, store_id),
        inArray(menu_combo_items.combo_id, combos.map((c) => c.id)),
      ))
      .orderBy(asc(menu_combo_items.sort_order), asc(menu_combo_items.item_id));

    const byCombo = new Map<string, ComboItemRow[]>();
    for (const it of items) {
      const arr = byCombo.get(it.combo_id) ?? [];
      arr.push({
        item_id:          it.item_id,
        quantity:         it.quantity,
        is_substitutable: it.is_substitutable,
        group_name:       it.group_name,
        sort_order:       it.sort_order,
      });
      byCombo.set(it.combo_id, arr);
    }

    return reply.send({
      combos: combos.map((c) => ({ ...c, items: byCombo.get(c.id) ?? [] })),
    });
  });

  // ── GET /api/menu/combos/:id ────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/:id', { preHandler: authenticate }, async (req, reply) => {
    const { store_id } = req.user as JWTPayload;
    const combo = await loadComboWithItems(store_id, req.params.id);
    if (!combo || combo.deleted_at != null) {
      return reply.status(404).send({ error: 'COMBO_NOT_FOUND' });
    }
    return reply.send(combo);
  });

  // ── POST /api/menu/combos ───────────────────────────────────────────────────
  app.post('/', {
    preHandler: [authenticate, requireRole(['owner', 'manager'])],
  }, async (req, reply) => {
    const { store_id, sub: user_id } = req.user as JWTPayload;
    const parsed = ComboCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.status(422).send({ error: 'INVALID_BODY', issues: parsed.error.issues });
    }
    const body = parsed.data;

    // Resolve items_total + validate item references
    const total = await resolveItemsTotal(store_id, body.items);
    if (!total.ok) {
      return reply.status(422).send({
        error: 'ITEMS_NOT_FOUND',
        message: 'one or more item_id not found, cross-store, soft-deleted, or missing price_cents',
        missing: total.missing,
      });
    }

    // BR-23: combo price_cents ≤ Σ(item price × qty)
    if (body.price_cents > total.total) {
      return reply.status(422).send({
        error: 'COMBO_PRICE_EXCEEDS_ITEMS_TOTAL',
        message: `price_cents (${body.price_cents}) > items_total_cents (${total.total})`,
        items_total_cents: total.total,
      });
    }
    const savings = total.total - body.price_cents;

    const newComboId = await db.transaction(async (tx) => {
      const [row] = await tx.insert(menu_combos).values({
        store_id,
        name:              body.name,
        description:       body.description,
        photo_url:         body.photo_url ?? null,
        price_cents:       body.price_cents,
        items_total_cents: total.total,
        savings_cents:     savings,
        dayparts_arr:      body.dayparts_arr,
        is_featured:       body.is_featured,
        show_on_tv:        body.show_on_tv,
        sort_order:        body.sort_order,
      }).returning({ id: menu_combos.id });

      await tx.insert(menu_combo_items).values(body.items.map((l) => ({
        store_id,
        combo_id:         row.id,
        item_id:          l.item_id,
        quantity:         l.quantity,
        is_substitutable: l.is_substitutable,
        group_name:       l.group_name ?? null,
        sort_order:       l.sort_order,
      })));

      return row.id;
    });

    await logAudit({
      store_id,
      entity_type: 'menu_combo',
      entity_id:   newComboId,
      operation:   'create',
      user_id,
      after: {
        price_cents:       body.price_cents,
        items_total_cents: total.total,
        savings_cents:     savings,
        items_count:       body.items.length,
      },
    }, req.log);

    await invalidateSnapshot(store_id);

    const created = await loadComboWithItems(store_id, newComboId);
    broadcast(store_id, 'display:combo_updated', { combo: created },
      (c) => c.device_type === 'tablet' || (c.device_type === 'tv' && c.role === 'menu'));

    return reply.status(201).send(created);
  });

  // ── PATCH /api/menu/combos/:id ──────────────────────────────────────────────
  app.patch<{ Params: { id: string } }>('/:id', {
    preHandler: [authenticate, requireRole(['owner', 'manager'])],
  }, async (req, reply) => {
    const { store_id, sub: user_id } = req.user as JWTPayload;

    const parsed = ComboPatchSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.status(422).send({ error: 'INVALID_BODY', issues: parsed.error.issues });
    }
    const patch = parsed.data;

    const before = await loadComboWithItems(store_id, req.params.id);
    if (!before || before.deleted_at != null) {
      return reply.status(404).send({ error: 'COMBO_NOT_FOUND' });
    }

    // Determine items + price for BR-23 recompute
    const effectiveItems = patch.items ?? before.items.map((i) => ({
      item_id: i.item_id, quantity: i.quantity,
      is_substitutable: i.is_substitutable, group_name: i.group_name, sort_order: i.sort_order,
    }));
    const effectivePrice = patch.price_cents ?? before.price_cents;

    let itemsTotal = before.items_total_cents;
    if (patch.items || patch.price_cents != null) {
      const total = await resolveItemsTotal(store_id, effectiveItems);
      if (!total.ok) {
        return reply.status(422).send({
          error: 'ITEMS_NOT_FOUND',
          message: 'one or more item_id not found, cross-store, soft-deleted, or missing price_cents',
          missing: total.missing,
        });
      }
      if (effectivePrice > total.total) {
        return reply.status(422).send({
          error: 'COMBO_PRICE_EXCEEDS_ITEMS_TOTAL',
          message: `price_cents (${effectivePrice}) > items_total_cents (${total.total})`,
          items_total_cents: total.total,
        });
      }
      itemsTotal = total.total;
    }
    const savings = itemsTotal - effectivePrice;

    await db.transaction(async (tx) => {
      const update: Record<string, unknown> = { updated_at: new Date() };
      if (patch.name        != null) update.name        = patch.name;
      if ('description'     in patch) update.description = patch.description ?? null;
      if ('photo_url'       in patch) update.photo_url   = patch.photo_url ?? null;
      if (patch.price_cents != null) update.price_cents = patch.price_cents;
      if (patch.dayparts_arr) update.dayparts_arr = patch.dayparts_arr;
      if (patch.is_sold_out  != null) update.is_sold_out = patch.is_sold_out;
      if (patch.is_featured  != null) update.is_featured = patch.is_featured;
      if (patch.show_on_tv   != null) update.show_on_tv  = patch.show_on_tv;
      if (patch.sort_order   != null) update.sort_order  = patch.sort_order;
      if (patch.items || patch.price_cents != null) {
        update.items_total_cents = itemsTotal;
        update.savings_cents     = savings;
      }

      await tx.update(menu_combos).set(update)
        .where(and(eq(menu_combos.store_id, store_id), eq(menu_combos.id, req.params.id)));

      if (patch.items) {
        await tx.delete(menu_combo_items)
          .where(and(
            eq(menu_combo_items.store_id, store_id),
            eq(menu_combo_items.combo_id, req.params.id),
          ));
        await tx.insert(menu_combo_items).values(patch.items.map((l) => ({
          store_id,
          combo_id:         req.params.id,
          item_id:          l.item_id,
          quantity:         l.quantity,
          is_substitutable: l.is_substitutable,
          group_name:       l.group_name ?? null,
          sort_order:       l.sort_order,
        })));
      }
    });

    const after = await loadComboWithItems(store_id, req.params.id);

    await logAudit({
      store_id,
      entity_type: 'menu_combo',
      entity_id:   req.params.id,
      operation:   'update',
      user_id,
      before: {
        price_cents:       before.price_cents,
        items_total_cents: before.items_total_cents,
        items_count:       before.items.length,
        is_sold_out:       before.is_sold_out,
        is_featured:       before.is_featured,
      },
      after: {
        price_cents:       after?.price_cents,
        items_total_cents: after?.items_total_cents,
        items_count:       after?.items.length ?? 0,
        is_sold_out:       after?.is_sold_out,
        is_featured:       after?.is_featured,
      },
    }, req.log);

    await invalidateSnapshot(store_id);

    broadcast(store_id, 'display:combo_updated', { combo: after },
      (c) => c.device_type === 'tablet' || (c.device_type === 'tv' && c.role === 'menu'));

    return reply.send(after);
  });

  // ── DELETE /api/menu/combos/:id (soft delete) ───────────────────────────────
  app.delete<{ Params: { id: string } }>('/:id', {
    preHandler: [authenticate, requireRole(['owner', 'manager'])],
  }, async (req, reply) => {
    const { store_id, sub: user_id } = req.user as JWTPayload;
    const [existing] = await db.select({
      id: menu_combos.id,
      deleted_at: menu_combos.deleted_at,
      price_cents: menu_combos.price_cents,
    }).from(menu_combos)
      .where(and(eq(menu_combos.store_id, store_id), eq(menu_combos.id, req.params.id)))
      .limit(1);
    if (!existing || existing.deleted_at != null) {
      return reply.status(404).send({ error: 'COMBO_NOT_FOUND' });
    }

    const now = new Date();
    await db.update(menu_combos)
      .set({ deleted_at: now, updated_at: now })
      .where(and(eq(menu_combos.store_id, store_id), eq(menu_combos.id, req.params.id)));

    await logAudit({
      store_id,
      entity_type: 'menu_combo',
      entity_id:   req.params.id,
      operation:   'delete',
      user_id,
      before: { price_cents: existing.price_cents },
    }, req.log);

    await invalidateSnapshot(store_id);

    broadcast(store_id, 'display:combo_updated', {
      combo: { id: req.params.id, deleted_at: now.toISOString() },
    }, (c) => c.device_type === 'tablet' || (c.device_type === 'tv' && c.role === 'menu'));

    return reply.status(204).send();
  });
};

export default combosPlugin;
