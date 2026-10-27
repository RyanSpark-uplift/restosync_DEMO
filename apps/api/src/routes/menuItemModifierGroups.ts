// Sprint 4 S4.5b — Item ↔ ModifierGroup attach/detach (M01 PRD v1.2 §5.2)
// AG-001 store_id WHERE / AG-009 /api prefix / AG-018 (store_id,item_id,group_id) unique
// AG-023 broadcast은 commit 후 / BR-20 sync_source != 'restosync' → 403
// AM01-013 invalidate(await) → broadcast / AM01-014 menu TV + Tablet
//
// has_modifiers 자동 동기화:
//   POST 첫 attach → menu_items.has_modifiers=true
//   DELETE 마지막 detach → has_modifiers=false

import type { FastifyPluginAsync } from 'fastify';
import { eq, and, isNull, asc, count } from 'drizzle-orm';
import { db } from '../db/db';
import {
  menu_items,
  menu_modifier_groups,
  menu_modifier_options,
  menu_item_modifier_groups,
} from '../db/schema';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { broadcast } from '../ws/broadcast';
import { logAudit } from '../services/audit';
import { invalidateSnapshot } from '../services/menuSnapshot';
import type { JWTPayload } from '../types';
import { AttachModifierGroupSchema } from '../schemas/menu';

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

const itemModifierGroupsPlugin: FastifyPluginAsync = async (app) => {

  // GET /api/menu/items/:id/modifier-groups — attached groups with options
  app.get<{ Params: { id: string } }>('/items/:id/modifier-groups', {
    preHandler: authenticate,
  }, async (req, reply) => {
    const { store_id } = req.user as JWTPayload;
    const item = await getOwnedItem(store_id, req.params.id);
    if (!item) return reply.status(404).send({ error: 'ITEM_NOT_FOUND' });

    const rows = await db
      .select({
        attachment: menu_item_modifier_groups,
        group:      menu_modifier_groups,
      })
      .from(menu_item_modifier_groups)
      .innerJoin(
        menu_modifier_groups,
        and(
          eq(menu_modifier_groups.id, menu_item_modifier_groups.group_id),
          isNull(menu_modifier_groups.deleted_at),
        ),
      )
      .where(and(
        eq(menu_item_modifier_groups.store_id, store_id),
        eq(menu_item_modifier_groups.item_id, item.id),
      ))
      .orderBy(asc(menu_item_modifier_groups.sort_order), asc(menu_item_modifier_groups.created_at), asc(menu_item_modifier_groups.group_id));

    if (rows.length === 0) return reply.send([]);

    const groupIds = rows.map((r) => r.group.id);
    const options = await db.select().from(menu_modifier_options)
      .where(and(
        eq(menu_modifier_options.store_id, store_id),
        isNull(menu_modifier_options.deleted_at),
      ));
    const byGroup = new Map<string, typeof options>();
    for (const o of options) {
      if (!groupIds.includes(o.group_id)) continue;
      const arr = byGroup.get(o.group_id) ?? [];
      arr.push(o);
      byGroup.set(o.group_id, arr);
    }

    return reply.send(rows.map((r) => ({
      ...r.group,
      sort_order: r.attachment.sort_order,
      attached_at: r.attachment.created_at,
      options: (byGroup.get(r.group.id) ?? []).sort(
        (a, b) => a.sort_order - b.sort_order
                || (a.created_at?.getTime?.() ?? 0) - (b.created_at?.getTime?.() ?? 0),
      ),
    })));
  });

  // POST /api/menu/items/:id/attach-modifier-group/:group_id
  app.post<{ Params: { id: string; group_id: string } }>(
    '/items/:id/attach-modifier-group/:group_id',
    { preHandler: [authenticate, requireRole(['owner', 'manager'])] },
    async (req, reply) => {
      const { store_id, sub: user_id } = req.user as JWTPayload;
      const { id: item_id, group_id } = req.params;

      const parsed = AttachModifierGroupSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: 'INVALID_BODY', issues: parsed.error.issues });
      }
      const { sort_order } = parsed.data;

      const item = await getOwnedItem(store_id, item_id);
      if (!item) return reply.status(404).send({ error: 'ITEM_NOT_FOUND' });

      if (item.sync_source !== 'restosync') {
        return reply.status(403).send({
          error: 'EXTERNAL_SYNC_LOCKED',
          sync_source: item.sync_source,
          message: 'Item is mastered by external POS. Modify modifier links in source system or detach sync.',
        });
      }

      const group = await getOwnedGroup(store_id, group_id);
      if (!group) return reply.status(404).send({ error: 'MODIFIER_GROUP_NOT_FOUND' });

      // AG-018 partial unique catches duplicate attach.
      try {
        const { attachment, updatedItem } = await db.transaction(async (tx) => {
          const [att] = await tx.insert(menu_item_modifier_groups).values({
            store_id,
            item_id,
            group_id,
            sort_order,
          }).returning();

          let updated = item;
          if (!item.has_modifiers) {
            const [u] = await tx.update(menu_items)
              .set({ has_modifiers: true, updated_at: new Date() })
              .where(and(
                eq(menu_items.store_id, store_id),
                eq(menu_items.id, item_id),
                isNull(menu_items.deleted_at),
              ))
              .returning();
            if (u) updated = u;
          }
          return { attachment: att, updatedItem: updated };
        });

        await logAudit({
          store_id, entity_type: 'menu_item', entity_id: item_id,
          operation: 'update', user_id,
          after: { modifier_group_attached: { group_id, sort_order } } as Record<string, unknown>,
        }, req.log);

        await invalidateSnapshot(store_id);
        broadcast(store_id, 'display:menu_item_updated', { item: updatedItem }, menuFilter);

        return reply.status(201).send(attachment);
      } catch (err) {
        if ((err as { code?: string }).code === '23505') {
          return reply.status(409).send({
            error: 'MODIFIER_GROUP_ALREADY_ATTACHED',
            item_id,
            group_id,
          });
        }
        throw err;
      }
    },
  );

  // DELETE /api/menu/items/:id/attach-modifier-group/:group_id
  app.delete<{ Params: { id: string; group_id: string } }>(
    '/items/:id/attach-modifier-group/:group_id',
    { preHandler: [authenticate, requireRole(['owner', 'manager'])] },
    async (req, reply) => {
      const { store_id, sub: user_id } = req.user as JWTPayload;
      const { id: item_id, group_id } = req.params;

      const item = await getOwnedItem(store_id, item_id);
      if (!item) return reply.status(404).send({ error: 'ITEM_NOT_FOUND' });

      if (item.sync_source !== 'restosync') {
        return reply.status(403).send({
          error: 'EXTERNAL_SYNC_LOCKED',
          sync_source: item.sync_source,
          message: 'Item is mastered by external POS. Modify modifier links in source system or detach sync.',
        });
      }

      const { detached, updatedItem } = await db.transaction(async (tx) => {
        const deleted = await tx.delete(menu_item_modifier_groups)
          .where(and(
            eq(menu_item_modifier_groups.store_id, store_id),
            eq(menu_item_modifier_groups.item_id, item_id),
            eq(menu_item_modifier_groups.group_id, group_id),
          ))
          .returning();

        if (deleted.length === 0) {
          return { detached: false, updatedItem: item };
        }

        const [{ n }] = await tx.select({ n: count() }).from(menu_item_modifier_groups)
          .where(and(
            eq(menu_item_modifier_groups.store_id, store_id),
            eq(menu_item_modifier_groups.item_id, item_id),
          ));

        let updated = item;
        if (Number(n) === 0 && item.has_modifiers) {
          const [u] = await tx.update(menu_items)
            .set({ has_modifiers: false, updated_at: new Date() })
            .where(and(
              eq(menu_items.store_id, store_id),
              eq(menu_items.id, item_id),
              isNull(menu_items.deleted_at),
            ))
            .returning();
          if (u) updated = u;
        }
        return { detached: true, updatedItem: updated };
      });

      if (!detached) return reply.status(404).send({ error: 'ATTACHMENT_NOT_FOUND' });

      await logAudit({
        store_id, entity_type: 'menu_item', entity_id: item_id,
        operation: 'update', user_id,
        before: { modifier_group_detached: { group_id } } as Record<string, unknown>,
      }, req.log);

      await invalidateSnapshot(store_id);
      broadcast(store_id, 'display:menu_item_updated', { item: updatedItem }, menuFilter);

      return reply.status(204).send();
    },
  );
};

export default itemModifierGroupsPlugin;
