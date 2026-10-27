import cron from 'node-cron';
import { lt, lte, gte, and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from '../db/db';
import { redis } from '../db/redis';
import { events, stores, store_settings, orders, order_state_transitions } from '../db/schema';
import { broadcast } from '../ws/broadcast';
import { enqueueSms } from './smsDispatcher';
import { invalidateSnapshot } from './menuSnapshot';
import { defaultStoreSettings, type StoreSettings, type DeepPartial } from '@restosync/shared/storeSettings';
import type { OrderStatus, Daypart } from '@restosync/shared/enums';

// Mirror of orders.ts nextDisplayNumber — kept local so the scheduler doesn't
// reach into the route module.
async function nextDisplayNumberForStore(storeId: string): Promise<string> {
  const raw = await redis.incr(`display:counter:${storeId}`);
  const n = ((raw - 1) % 99) + 1;
  return String(n);
}

// ── helpers ──────────────────────────────────────────────────────────────────

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

interface StoreContext {
  id: string;
  timezone: string;
  settings: StoreSettings;
}

async function loadStoreContexts(): Promise<StoreContext[]> {
  const storeRows = await db.select({ id: stores.id, timezone: stores.timezone }).from(stores);
  if (storeRows.length === 0) return [];
  const settingsRows = await db.select().from(store_settings);
  const byStore = new Map(settingsRows.map((r) => [r.store_id, r.config as DeepPartial<StoreSettings>]));
  return storeRows.map((s) => ({
    id: s.id,
    timezone: s.timezone ?? 'America/Los_Angeles',
    settings: deepMerge(defaultStoreSettings(), byStore.get(s.id) ?? {}),
  }));
}

// Get current 'HH:mm' in a given IANA timezone.
function localHHmm(tz: string, when = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz,
  });
  // en-US 'HH:mm' — Intl may emit '24:00' for midnight; normalize.
  const s = fmt.format(when).replace(/^24:/, '00:');
  return s;
}

// Compute the daypart bucket name from store settings + local time.
function currentDaypart(settings: StoreSettings, tz: string, when = new Date()): Daypart {
  const hhmm = localHHmm(tz, when);
  const within = (a: string, b: string) => hhmm >= a && hhmm < b;
  const { breakfast, lunch, dinner } = settings.daypart;
  if (within(breakfast[0], breakfast[1])) return 'breakfast';
  if (within(lunch[0], lunch[1]))         return 'lunch';
  if (within(dinner[0], dinner[1]))       return 'dinner';
  return 'all';
}

// ── exported scheduler ────────────────────────────────────────────────────────

export function startScheduler(): void {
  // ── (existing) events activation/deactivation, every minute ────────────────
  cron.schedule('* * * * *', async () => {
    const now = new Date();
    try {
      const toActivate = await db
        .update(events)
        .set({ active: true })
        .where(and(
          lte(events.start_at, now),
          gte(events.end_at, now),
          eq(events.active, false),
        ))
        .returning();

      const toDeactivate = await db
        .update(events)
        .set({ active: false })
        .where(and(
          lt(events.end_at, now),
          eq(events.active, true),
        ))
        .returning();

      for (const ev of toActivate) {
        broadcast(ev.store_id, 'display:event_push', ev,
          (c) => c.device_type === 'tv' && c.role === 'event');
      }
      for (const ev of toDeactivate) {
        broadcast(ev.store_id, 'display:event_clear', { event_id: ev.id },
          (c) => c.device_type === 'tv' && c.role === 'event');
      }
    } catch (err) {
      console.error('[scheduler] event cron error:', (err as Error).message);
    }
  });

  // ── feedback ping cron — spec sec.25.2.
  //    Selects orders collected within feedback_delay_minutes ago (per store) that
  //    we haven't pinged yet (Redis dedupe key feedback:pinged:<order_id>, TTL 7d).
  //    Enqueues SMS via existing smsDispatcher with the loyalty/feedback template.
  cron.schedule('* * * * *', async () => {
    try {
      const ctxs = await loadStoreContexts();
      for (const ctx of ctxs) {
        const loyalty  = ctx.settings.loyalty;
        const notify   = ctx.settings.notify;
        if (!loyalty?.feedback_enabled) continue;
        if (!notify?.sms_enabled)       continue;
        const delayMin = loyalty.feedback_delay_minutes ?? 2;

        // pickedUp window: between (now - delayMin*60s - 60s) and (now - delayMin*60s)
        // — i.e. orders that crossed the delay boundary in the last minute. Cron is
        // every minute, so this is the natural span; orders missed (server downtime)
        // get a 1-min grace via the inclusive lower bound.
        const due = await db
          .select({
            id: orders.id,
            display_number: orders.display_number,
            customer_phone: orders.customer_phone,
          })
          .from(orders)
          .where(and(
            eq(orders.store_id, ctx.id),
            eq(orders.status, 'collected'),
            sql`"collected_at" >= now() - make_interval(mins => ${delayMin + 1})`,
            sql`"collected_at" <  now() - make_interval(mins => ${delayMin})`,
            isNotNull(orders.customer_phone),
          ));

        for (const o of due) {
          const key = `feedback:pinged:${o.id}`;
          // Atomic dedupe: SET NX EX 7d. If exists, skip.
          const set = await redis.set(key, '1', 'EX', 7 * 24 * 3600, 'NX');
          if (set !== 'OK') continue;
          await enqueueSms({
            store_id: ctx.id,
            order_id: o.id,
            to: o.customer_phone!,
            template: 'feedback',
            body: `${loyalty.feedback_template ?? 'How was your order?'} Order #${o.display_number}`,
          });
        }
      }
    } catch (err) {
      console.error('[scheduler] feedback cron error:', (err as Error).message);
    }
  });

  // ── scheduled-order promotion — every minute. Promotes orders whose
  //    pickup_time - estimated_prep_minutes (defaulting to 10 minutes) has
  //    arrived. Spec sec.19.
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      const due = await db
        .select()
        .from(orders)
        .where(and(
          eq(orders.status, 'scheduled'),
          // pickup_time - (estimated_prep_minutes || 10) <= now()
          sql`COALESCE("pickup_time", now()) - make_interval(mins => COALESCE("estimated_prep_minutes", 10)) <= now()`,
        ));
      for (const o of due) {
        try {
          const display_number = await nextDisplayNumberForStore(o.store_id);
          await db.transaction(async (tx) => {
            await tx.update(orders)
              .set({ status: 'new' as OrderStatus, display_number })
              .where(eq(orders.id, o.id));
            await tx.insert(order_state_transitions).values({
              store_id: o.store_id,
              order_id: o.id,
              from_status: 'scheduled' as OrderStatus,
              to_status: 'new' as OrderStatus,
              actor: 'system' as const,
              reason: 'scheduled_promotion',
            });
          });
          broadcast(o.store_id, 'order:scheduled_promoted', {
            order_id: o.id, display_number, pickup_time: o.pickup_time,
          });
          broadcast(o.store_id, 'order:new', { ...o, display_number, status: 'new' });
        } catch (perOrder) {
          console.warn(`[scheduler] failed to promote order ${o.id}: ${(perOrder as Error).message}`);
        }
      }
    } catch (err) {
      console.error('[scheduler] scheduled promotion error:', (err as Error).message);
    }
  });

  // ── daypart engine — every 5 min, broadcast display:daypart_changed on change.
  // AG-013 4-value canonical: breakfast | lunch | dinner | all.
  cron.schedule('*/5 * * * *', async () => {
    try {
      const ctxs = await loadStoreContexts();
      for (const ctx of ctxs) {
        const next = currentDaypart(ctx.settings, ctx.timezone);
        const key = `daypart:current:${ctx.id}`;
        const prev = await redis.get(key);
        if (prev !== next) {
          await redis.set(key, next);
          // AM01-013: snapshot의 current_daypart 필드가 변경되므로 invalidate
          await invalidateSnapshot(ctx.id);
          broadcast(ctx.id, 'display:daypart_changed', { daypart: next });
        }
      }
    } catch (err) {
      console.error('[scheduler] daypart cron error:', (err as Error).message);
    }
  });

  // ── daily closeout — runs hourly; per store, fires when store-local time
  //    crosses store_settings.timeout.closeout_time (default 04:00). Bulk
  //    expires non-terminal orders, audit-logs, resets display counter,
  //    broadcasts. Spec sec.14.
  cron.schedule('0 * * * *', async () => {
    try {
      const ctxs = await loadStoreContexts();
      const ACTIVE: OrderStatus[] = ['new', 'prep', 'ready_to_expedite', 'ready', 'remaking', 'scheduled'];

      for (const ctx of ctxs) {
        const closeoutHHmm = ctx.settings.timeout.closeout_time;
        const closeoutHour = closeoutHHmm.slice(0, 2);
        const localHour = localHHmm(ctx.timezone).slice(0, 2);
        if (localHour !== closeoutHour) continue;

        // Guard against double-run within the same hour (cron retry, server restart).
        const guardKey = `closeout:done:${ctx.id}:${new Date().toISOString().slice(0, 10)}:${closeoutHour}`;
        const already = await redis.get(guardKey);
        if (already) continue;
        await redis.set(guardKey, '1', 'EX', 3600 * 6);

        const activeRows = await db
          .select({ id: orders.id, display_number: orders.display_number, status: orders.status })
          .from(orders)
          .where(and(eq(orders.store_id, ctx.id), inArray(orders.status, ACTIVE)));

        if (activeRows.length > 0) {
          await db.transaction(async (tx) => {
            await tx
              .update(orders)
              .set({ status: 'expired' as OrderStatus, expired_at: new Date() })
              .where(and(eq(orders.store_id, ctx.id), inArray(orders.status, ACTIVE)));
            await tx.insert(order_state_transitions).values(
              activeRows.map((r) => ({
                store_id: ctx.id,
                order_id: r.id,
                from_status: r.status as OrderStatus,
                to_status: 'expired' as OrderStatus,
                actor: 'system' as const,
                reason: 'daily_closeout',
              })),
            );
          });

          for (const r of activeRows) {
            broadcast(ctx.id, 'order:expired', { order_id: r.id, display_number: r.display_number });
            broadcast(
              ctx.id,
              'display:order_remove',
              { display_number: r.display_number },
              (c) => c.device_type === 'tv' && c.role === 'pickup',
            );
          }
        }

        // Reset display_number counter for the new day.
        await redis.del(`display:counter:${ctx.id}`);
        console.log(`[scheduler] closeout for store ${ctx.id}: expired ${activeRows.length} orders`);
      }
    } catch (err) {
      console.error('[scheduler] closeout cron error:', (err as Error).message);
    }
  });
}

// Exported for tests.
export const __test__ = { currentDaypart, localHHmm, deepMerge };
