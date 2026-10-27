import type { FastifyPluginAsync } from 'fastify';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { db } from '../db/db';
import { redis } from '../db/redis';
import { orders, order_state_transitions, store_settings, venue_group_members } from '../db/schema';
import { authenticate } from '../middleware/auth';
import { broadcast } from '../ws/broadcast';
import { enqueueSms } from '../services/smsDispatcher';
import { estimatePrepTime } from '../services/aiPrepTime';
import type { JWTPayload } from '../types';
import {
  ORDER_SOURCE,
  ORDER_STATUS,
  ORDER_STATUS_TRANSITIONS,
  ORDER_STATUS_TERMINAL,
  canTransition,
} from '@restosync/shared/enums';

// ── 타입 ─────────────────────────────────────────────────────────────────────
type OrderSource = (typeof ORDER_SOURCE)[number];
type OrderStatus = (typeof ORDER_STATUS)[number];

// ── daypart 자동 계산 (AG-013: 4-value) ──────────────────────────────────────
type Daypart = 'breakfast' | 'lunch' | 'dinner' | 'all';
function getCurrentDaypart(tz = 'America/Los_Angeles'): Daypart {
  const hour = parseInt(
    new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: tz }),
    10,
  );
  if (hour >= 5  && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 16) return 'lunch';
  if (hour >= 16 && hour < 22) return 'dinner';
  return 'all';
}

// ── display_number 생성 (Redis 카운터, 1-99 순환) ─────────────────────────────
async function nextDisplayNumber(storeId: string): Promise<string> {
  const key = `display:counter:${storeId}`;
  const raw = await redis.incr(key);
  // 만료 없음 — 서버 재시작 후에도 유지
  const n = ((raw - 1) % 99) + 1;  // 1~99 순환
  return String(n);
}

// ── status 전이 규칙 ─────────────────────────────────────────────────────────
// AG-013: canonical 9-state machine sourced from shared/enums.ts (ORDER_STATUS_TRANSITIONS).
// Local re-export kept for backward compatibility with tests/log statements.
const VALID_TRANSITIONS = ORDER_STATUS_TRANSITIONS;

// Helper — read store_settings.notify.* for a store. Returns null on miss so
// callers can skip the SMS path cheaply.
async function getNotifySettings(storeId: string): Promise<{
  sms_enabled: boolean; notify_on_ready: boolean;
} | null> {
  const [row] = await db
    .select({ config: store_settings.config })
    .from(store_settings)
    .where(eq(store_settings.store_id, storeId))
    .limit(1);
  if (!row) return null;
  const cfg = row.config as { notify?: { sms_enabled?: boolean; notify_on_ready?: boolean } };
  return {
    sms_enabled:    cfg.notify?.sms_enabled ?? false,
    notify_on_ready: cfg.notify?.notify_on_ready ?? true,
  };
}

// Helper — display.ready_auto_remove_* governs whether ready cards disappear
// after a timer or stay until staff press "Picked Up" on the Dashboard.
// Defaults preserve the spec sec.4.5 behaviour (30s auto-remove) for stores
// that haven't customised the setting.
async function getReadyAutoRemove(storeId: string): Promise<{
  enabled: boolean; seconds: number;
}> {
  const [row] = await db
    .select({ config: store_settings.config })
    .from(store_settings)
    .where(eq(store_settings.store_id, storeId))
    .limit(1);
  const cfg = (row?.config ?? {}) as {
    display?: { ready_auto_remove_enabled?: boolean; ready_auto_remove_seconds?: number };
  };
  const enabled = cfg.display?.ready_auto_remove_enabled ?? false;
  const raw     = Number(cfg.display?.ready_auto_remove_seconds);
  const seconds = Number.isFinite(raw) && raw > 0 ? Math.max(5, Math.min(600, raw)) : 30;
  return { enabled, seconds };
}

// Helper — derive which column to stamp for a given to_status transition.
function timestampFieldForStatus(s: OrderStatus): Partial<typeof orders.$inferInsert> {
  const now = new Date();
  switch (s) {
    case 'prep':              return { preparing_at: now };
    case 'ready_to_expedite': return { expedite_at: now };
    case 'ready':             return { ready_at: now };
    case 'collected':         return { collected_at: now, picked_up_at: now };
    case 'expired':           return { expired_at: now };
    default:                  return {};
  }
}

// ── venue 멤버십 조회 (multi_venue TV 컬럼 레이아웃용) ─────────────────────────
async function getVenueMeta(storeId: string) {
  const [m] = await db
    .select({ label: venue_group_members.label, color_hex: venue_group_members.color_hex })
    .from(venue_group_members)
    .where(eq(venue_group_members.store_id, storeId))
    .limit(1);
  return { venue_label: m?.label ?? null, venue_color: m?.color_hex ?? null };
}

// ── 진행중 타이머 (display:order_remove, expedite→ready auto-advance 등) ──────
// Keyed by (orderId, kind) — multiple coexisting timers per order are supported.
type TimerKind = 'ready_remove' | 'expedite_to_ready' | 'undo_window';
const orderTimers = new Map<string, ReturnType<typeof setTimeout>>();
const timerKey = (orderId: string, kind: TimerKind) => `${orderId}:${kind}`;

function setOrderTimer(orderId: string, kind: TimerKind, ms: number, cb: () => void) {
  const key = timerKey(orderId, kind);
  const existing = orderTimers.get(key);
  if (existing) clearTimeout(existing);
  const t = setTimeout(() => { orderTimers.delete(key); cb(); }, ms);
  orderTimers.set(key, t);
}

function clearOrderTimer(orderId: string, kind: TimerKind) {
  const key = timerKey(orderId, kind);
  const t = orderTimers.get(key);
  if (t) { clearTimeout(t); orderTimers.delete(key); }
}

function clearAllOrderTimers(orderId: string) {
  for (const kind of ['ready_remove', 'expedite_to_ready', 'undo_window'] as TimerKind[]) {
    clearOrderTimer(orderId, kind);
  }
}

// ── JSON Schema ──────────────────────────────────────────────────────────────
const createOrderBody = {
  type: 'object' as const,
  required: ['items'],
  properties: {
    customer_name:  { type: 'string', maxLength: 60 },
    items:          { type: 'array' },
    source:         { type: 'string', enum: ORDER_SOURCE as unknown as string[] },
    external_id:    { type: 'string', maxLength: 80 },
    /** Optional explicit display_number — walk-in/manual path. Otherwise server allocates. */
    display_number: { type: 'string', minLength: 1, maxLength: 6 },
  },
  additionalProperties: false,
};

const updateStatusBody = {
  type: 'object' as const,
  required: ['status'],
  properties: {
    status: { type: 'string', enum: ORDER_STATUS as unknown as string[] },
  },
  additionalProperties: false,
};

const listQuery = {
  type: 'object' as const,
  properties: {
    status: { type: 'string' },
    limit:  { type: 'integer', minimum: 1, maximum: 100, default: 50 },
  },
};

// ── 인터페이스 ────────────────────────────────────────────────────────────────
interface CreateOrderBody {
  customer_name?: string;
  items: unknown[];
  source?: OrderSource;
  external_id?: string;
  display_number?: string;
}
interface UpdateStatusBody { status: OrderStatus }
interface ListQuery { status?: string; limit?: number }

// ── Plugin ────────────────────────────────────────────────────────────────────
const ordersPlugin: FastifyPluginAsync = async (app) => {

  // GET /api/orders/stats — 상태별 카운트 (static route → /:id보다 먼저 등록)
  app.get('/stats', { preHandler: authenticate }, async (req, reply) => {
    const { store_id } = req.user as JWTPayload;

    const rows = await db
      .select({ status: orders.status, count: sql<number>`count(*)::int` })
      .from(orders)
      .where(eq(orders.store_id, store_id))
      .groupBy(orders.status);

    const stats = Object.fromEntries(rows.map((r) => [r.status, r.count]));
    return reply.send(stats);
  });

  // GET /api/orders
  app.get<{ Querystring: ListQuery }>(
    '/',
    { preHandler: authenticate, schema: { querystring: listQuery } },
    async (req, reply) => {
      const { store_id } = req.user as JWTPayload;
      const { status: statusParam, limit = 50 } = req.query;

      // AG-001: store_id WHERE 필수
      const statusFilter = statusParam
        ? statusParam.split(',').filter((s) => (ORDER_STATUS as readonly string[]).includes(s)) as OrderStatus[]
        : null;

      const [results, venueMeta] = await Promise.all([
        db
          .select()
          .from(orders)
          .where(
            statusFilter?.length
              ? and(eq(orders.store_id, store_id), inArray(orders.status, statusFilter))
              : eq(orders.store_id, store_id),
          )
          .orderBy(orders.created_at)
          .limit(limit),
        getVenueMeta(store_id),
      ]);

      return reply.send(results.map((o) => ({ ...o, ...venueMeta })));
    },
  );

  // POST /api/orders/manual — staff-entered order with explicit display_number.
  // Walk-in paper-ticket flow: number typed on the Dashboard keypad, no items list,
  // source forced to 'manual'. The display_number collision check (AG-018 partial
  // unique on active rows) prevents two manual entries from clobbering each other.
  app.post<{ Body: { display_number: string; customer_name?: string } }>(
    '/manual',
    {
      preHandler: authenticate,
      schema: {
        body: {
          type: 'object',
          required: ['display_number'],
          properties: {
            display_number: { type: 'string', minLength: 1, maxLength: 6 },
            customer_name:  { type: 'string', maxLength: 60 },
          },
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      const { store_id } = req.user as JWTPayload;
      const { display_number, customer_name } = req.body;
      let order: typeof orders.$inferSelect;
      try {
        [order] = await db.insert(orders).values({
          store_id,
          display_number,
          customer_name,
          source: 'manual',
          items: JSON.stringify([]),
        }).returning();
      } catch (err: unknown) {
        if ((err as { code?: string }).code === '23505') {
          return reply.status(409).send({
            error: 'DISPLAY_NUMBER_CONFLICT',
            detail: `Order #${display_number} is already active`,
          });
        }
        throw err;
      }
      const venueMeta = await getVenueMeta(store_id);
      const orderWithVenue = { ...order, ...venueMeta };
      broadcast(
        store_id,
        'order:new',
        orderWithVenue,
        (c) => c.device_type === 'tablet' || (c.device_type === 'tv' && c.role === 'pickup'),
      );
      return reply.status(201).send(orderWithVenue);
    },
  );

  // POST /api/orders
  app.post<{ Body: CreateOrderBody }>(
    '/',
    { preHandler: authenticate, schema: { body: createOrderBody } },
    async (req, reply) => {
      const { store_id } = req.user as JWTPayload;
      const { customer_name, items, source = 'manual', external_id, display_number: requestedDn } = req.body;

      // Walk-in / paper-ticket flow may pass an explicit display_number. AG-018
      // partial unique on active rows catches double-booking and returns 409.
      const display_number = requestedDn ?? await nextDisplayNumber(store_id);
      const daypart = getCurrentDaypart();

      // P4-A: AI prep time Stage 1 — apply static lookup using current store settings.
      const [settingsRow] = await db
        .select({ config: store_settings.config })
        .from(store_settings)
        .where(eq(store_settings.store_id, store_id))
        .limit(1);
      const prepEstimate = estimatePrepTime({
        items,
        storedConfig: settingsRow?.config as Parameters<typeof estimatePrepTime>[0]['storedConfig'],
      });

      let order: typeof orders.$inferSelect;
      try {
        [order] = await db.insert(orders).values({
          store_id,
          display_number,
          customer_name,
          items: JSON.stringify(items),
          source,
          external_id,
          estimated_prep_minutes: prepEstimate.estimated_minutes,
        }).returning();
      } catch (err: unknown) {
        // AG-018: partial unique 위반 (display_number 충돌 — 99+개 동시 활성)
        if ((err as { code?: string }).code === '23505') {
          return reply.status(409).send({ error: 'DISPLAY_NUMBER_CONFLICT', detail: 'Too many active orders' });
        }
        throw err;
      }

      // WS: order:new → tablet + pickup TV (multi_venue 레이아웃용)
      const venueMeta = await getVenueMeta(store_id);
      const orderWithVenue = { ...order, ...venueMeta };
      broadcast(
        store_id,
        'order:new',
        orderWithVenue,
        (c) => c.device_type === 'tablet' || (c.device_type === 'tv' && c.role === 'pickup'),
      );

      return reply.status(201).send({ ...orderWithVenue, daypart });
    },
  );

  // PATCH /api/orders/:id/status
  app.patch<{ Params: { id: string }; Body: UpdateStatusBody }>(
    '/:id/status',
    { preHandler: authenticate, schema: { body: updateStatusBody } },
    async (req, reply) => {
      const { store_id, sub: userId } = req.user as JWTPayload;
      const { id } = req.params;
      const { status: newStatus } = req.body;

      // AG-001: store_id scope
      const [order] = await db
        .select()
        .from(orders)
        .where(and(eq(orders.store_id, store_id), eq(orders.id, id)))
        .limit(1);

      if (!order) return reply.status(404).send({ error: 'ORDER_NOT_FOUND' });

      // 전이 규칙 검증 — shared canonical (9-state)
      const currentStatus = order.status as OrderStatus;
      if (!canTransition(currentStatus, newStatus)) {
        return reply.status(422).send({
          error: 'INVALID_STATUS_TRANSITION',
          from: currentStatus,
          to: newStatus,
          allowed: VALID_TRANSITIONS[currentStatus] ?? [],
        });
      }

      // Update + audit log in same transaction (analytics-grade durability).
      const updated = await db.transaction(async (tx) => {
        const [u] = await tx
          .update(orders)
          .set({ status: newStatus, ...timestampFieldForStatus(newStatus) })
          .where(and(eq(orders.store_id, store_id), eq(orders.id, id)))
          .returning();
        await tx.insert(order_state_transitions).values({
          store_id,
          order_id: id,
          from_status: currentStatus,
          to_status: newStatus,
          actor: 'staff',
          actor_id: userId,
        });
        return u;
      });

      // ── WS 브로드캐스트 ────────────────────────────────────────────────────
      const statusPayload = {
        order_id: id,
        status: newStatus,
        display_number: order.display_number,
      };
      broadcast(store_id, 'order:status_changed', statusPayload);

      if (newStatus === 'ready_to_expedite') {
        broadcast(
          store_id,
          'display:order_expedite',
          { display_number: order.display_number },
          (c) => c.device_type === 'tv' && c.role === 'pickup',
        );
      }

      if (newStatus === 'ready') {
        const autoRemove = await getReadyAutoRemove(store_id);
        broadcast(
          store_id,
          'display:order_ready',
          {
            display_number: order.display_number,
            flash: true,
            // Tell the TV viewer how to behave — keep card forever vs. schedule
            // its own remove timer. Lets the client mirror the server policy
            // even if the server's setOrderTimer is lost to a restart.
            auto_remove_enabled: autoRemove.enabled,
            auto_remove_seconds: autoRemove.seconds,
          },
          (c) => c.device_type === 'tv' && c.role === 'pickup',
        );
        if (autoRemove.enabled) {
          setOrderTimer(id, 'ready_remove', autoRemove.seconds * 1000, () => {
            broadcast(
              store_id,
              'display:order_remove',
              { display_number: order.display_number },
              (c) => c.device_type === 'tv' && c.role === 'pickup',
            );
          });
        }
        // else: card stays on TV until staff press Picked Up (collected status)
        // — see the collected branch below which fires display:order_remove.
        // Spec sec.9 — fire-and-forget SMS to the customer if enabled + phone present.
        if (order.customer_phone) {
          getNotifySettings(store_id).then((cfg) => {
            if (cfg?.sms_enabled && cfg.notify_on_ready) {
              enqueueSms({
                store_id,
                order_id: id,
                to: order.customer_phone!,
                template: 'order_ready',
                body: `Order #${order.display_number} is ready for pickup.`,
              }).catch(() => { /* logged inside dispatcher */ });
            }
          }).catch(() => { /* settings read failed — skip SMS */ });
        }
      }

      if (ORDER_STATUS_TERMINAL.has(newStatus)) {
        clearAllOrderTimers(id);
        if (newStatus === 'collected' || newStatus === 'expired') {
          broadcast(
            store_id,
            'display:order_remove',
            { display_number: order.display_number },
            (c) => c.device_type === 'tv' && c.role === 'pickup',
          );
        }
        if (newStatus === 'expired') {
          broadcast(store_id, 'order:expired', { order_id: id, display_number: order.display_number });
        }
        if (newStatus === 'cancelled') {
          broadcast(store_id, 'order:cancelled', { order_id: id, display_number: order.display_number });
        }
      }

      return reply.send(updated);
    },
  );

  // POST /api/orders/:id/accept — Manual/Hybrid accept-mode 채널 (배달앱 등) 수락
  // §3.5 Order Accept Mode. accepted_at 채우고 new → prep 전이.
  app.post<{ Params: { id: string } }>(
    '/:id/accept',
    { preHandler: authenticate },
    async (req, reply) => {
      const { store_id, sub: userId } = req.user as JWTPayload;
      const { id } = req.params;
      const [order] = await db.select().from(orders)
        .where(and(eq(orders.store_id, store_id), eq(orders.id, id)))
        .limit(1);
      if (!order) return reply.status(404).send({ error: 'ORDER_NOT_FOUND' });
      if (order.status !== 'new') {
        return reply.status(422).send({ error: 'INVALID_ACCEPT_STATE', current: order.status });
      }
      const now = new Date();
      const [updated] = await db.transaction(async (tx) => {
        const u = await tx.update(orders)
          .set({ status: 'prep', accepted_at: now, preparing_at: now })
          .where(and(eq(orders.store_id, store_id), eq(orders.id, id)))
          .returning();
        await tx.insert(order_state_transitions).values({
          store_id, order_id: id, from_status: 'new', to_status: 'prep',
          actor: 'staff', actor_id: userId, reason: 'manual_accept',
        });
        return u;
      });
      broadcast(store_id, 'order:accepted', { order_id: id, display_number: order.display_number });
      broadcast(store_id, 'order:status_changed', {
        order_id: id, status: 'prep', display_number: order.display_number,
      });
      return reply.send(updated);
    },
  );

  // POST /api/orders/:id/reject — 거절 (배달 플랫폼 push back 별도)
  app.post<{ Params: { id: string }; Body: { reason?: string } }>(
    '/:id/reject',
    {
      preHandler: authenticate,
      schema: {
        body: {
          type: 'object',
          properties: { reason: { type: 'string', maxLength: 60 } },
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      const { store_id, sub: userId } = req.user as JWTPayload;
      const { id } = req.params;
      const { reason } = req.body ?? {};
      const [order] = await db.select().from(orders)
        .where(and(eq(orders.store_id, store_id), eq(orders.id, id)))
        .limit(1);
      if (!order) return reply.status(404).send({ error: 'ORDER_NOT_FOUND' });
      if (order.status !== 'new') {
        return reply.status(422).send({ error: 'INVALID_REJECT_STATE', current: order.status });
      }
      const [updated] = await db.transaction(async (tx) => {
        const u = await tx.update(orders)
          .set({ status: 'cancelled' })
          .where(and(eq(orders.store_id, store_id), eq(orders.id, id)))
          .returning();
        await tx.insert(order_state_transitions).values({
          store_id, order_id: id, from_status: 'new', to_status: 'cancelled',
          actor: 'staff', actor_id: userId, reason: reason ?? 'rejected',
        });
        return u;
      });
      broadcast(store_id, 'order:rejected', { order_id: id, display_number: order.display_number, reason });
      broadcast(store_id, 'order:cancelled', { order_id: id, display_number: order.display_number });
      return reply.send(updated);
    },
  );

  // POST /api/orders/:id/mark_picked_up — ready → collected + 5s undo window (Redis PX)
  app.post<{ Params: { id: string } }>(
    '/:id/mark_picked_up',
    { preHandler: authenticate },
    async (req, reply) => {
      const { store_id, sub: userId } = req.user as JWTPayload;
      const { id } = req.params;
      const [order] = await db.select().from(orders)
        .where(and(eq(orders.store_id, store_id), eq(orders.id, id)))
        .limit(1);
      if (!order) return reply.status(404).send({ error: 'ORDER_NOT_FOUND' });
      if (order.status !== 'ready') {
        return reply.status(422).send({ error: 'INVALID_PICKED_UP_STATE', current: order.status });
      }
      const now = new Date();
      const [updated] = await db.transaction(async (tx) => {
        const u = await tx.update(orders)
          .set({ status: 'collected', collected_at: now, picked_up_at: now })
          .where(and(eq(orders.store_id, store_id), eq(orders.id, id)))
          .returning();
        await tx.insert(order_state_transitions).values({
          store_id, order_id: id, from_status: 'ready', to_status: 'collected',
          actor: 'staff', actor_id: userId, reason: 'staff_pickup',
        });
        return u;
      });
      // 5s undo window — Redis PX 5000 records the prior status.
      await redis.set(`undo:${id}`, 'ready', 'PX', 5000);
      clearAllOrderTimers(id);
      broadcast(store_id, 'order:status_changed', {
        order_id: id, status: 'collected', display_number: order.display_number,
      });
      broadcast(
        store_id,
        'display:order_remove',
        { display_number: order.display_number },
        (c) => c.device_type === 'tv' && c.role === 'pickup',
      );
      return reply.send(updated);
    },
  );

  // POST /api/orders/:id/undo — within 5s of mark_picked_up, restore READY.
  app.post<{ Params: { id: string } }>(
    '/:id/undo',
    { preHandler: authenticate },
    async (req, reply) => {
      const { store_id, sub: userId } = req.user as JWTPayload;
      const { id } = req.params;
      const prior = await redis.get(`undo:${id}`);
      if (!prior) return reply.status(410).send({ error: 'UNDO_WINDOW_EXPIRED' });
      const [order] = await db.select().from(orders)
        .where(and(eq(orders.store_id, store_id), eq(orders.id, id)))
        .limit(1);
      if (!order) return reply.status(404).send({ error: 'ORDER_NOT_FOUND' });
      const [updated] = await db.transaction(async (tx) => {
        const u = await tx.update(orders)
          .set({ status: prior as OrderStatus, collected_at: null, picked_up_at: null })
          .where(and(eq(orders.store_id, store_id), eq(orders.id, id)))
          .returning();
        await tx.insert(order_state_transitions).values({
          store_id, order_id: id, from_status: order.status, to_status: prior as OrderStatus,
          actor: 'staff', actor_id: userId, reason: 'undo',
        });
        return u;
      });
      await redis.del(`undo:${id}`);
      broadcast(store_id, 'order:undo', { order_id: id, display_number: order.display_number });
      broadcast(store_id, 'order:status_changed', {
        order_id: id, status: prior, display_number: order.display_number,
      });
      if (prior === 'ready') {
        broadcast(
          store_id,
          'display:order_ready',
          { display_number: order.display_number, flash: false },
          (c) => c.device_type === 'tv' && c.role === 'pickup',
        );
      }
      return reply.send(updated);
    },
  );

  // POST /api/orders/:id/verify_pickup — pre-pickup verification.
  // Mode comes from store_settings.workflow.pickup_verification:
  //   'none'   -> always 200 { verified: true }
  //   'manual' -> body.display_number must match the order
  //   'qr'     -> body.token must verify against QR_HMAC_SECRET and resolve
  //               to this order_id / store_id (token must not be expired)
  // Does NOT transition status — staff still calls mark_picked_up afterwards.
  // Spec sec.21 + workflow.pickup_verification setting.
  app.post<{ Params: { id: string }; Body: { display_number?: string; token?: string } }>(
    '/:id/verify_pickup',
    {
      preHandler: authenticate,
      schema: {
        body: {
          type: 'object',
          properties: {
            display_number: { type: 'string', maxLength: 10 },
            token:          { type: 'string', maxLength: 400 },
          },
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      const { store_id } = req.user as JWTPayload;
      const { id } = req.params;
      const [order] = await db.select().from(orders)
        .where(and(eq(orders.store_id, store_id), eq(orders.id, id)))
        .limit(1);
      if (!order) return reply.status(404).send({ error: 'ORDER_NOT_FOUND' });

      const [settingsRow] = await db
        .select({ config: store_settings.config })
        .from(store_settings)
        .where(eq(store_settings.store_id, store_id))
        .limit(1);
      const mode = ((settingsRow?.config as Record<string, Record<string, string>> | null)
        ?.workflow?.pickup_verification) ?? 'none';

      if (mode === 'none') {
        return reply.send({ verified: true, mode });
      }
      if (mode === 'manual') {
        if (!req.body?.display_number || req.body.display_number !== order.display_number) {
          return reply.status(403).send({ verified: false, mode, error: 'DISPLAY_NUMBER_MISMATCH' });
        }
        return reply.send({ verified: true, mode });
      }
      if (mode === 'qr') {
        const secret = process.env.QR_HMAC_SECRET;
        if (!secret) return reply.status(503).send({ verified: false, mode, error: 'QR_NOT_CONFIGURED' });
        const token = req.body?.token;
        if (!token) return reply.status(403).send({ verified: false, mode, error: 'TOKEN_REQUIRED' });
        // Inline copy of verifyToken from qr.ts to avoid cross-route import surface.
        const [body, sig] = token.split('.');
        if (!body || !sig) return reply.status(403).send({ verified: false, mode, error: 'BAD_TOKEN' });
        const crypto = await import('crypto');
        const expected = crypto.createHmac('sha256', secret).update(body).digest('base64')
          .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        const a = Buffer.from(sig);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
          return reply.status(403).send({ verified: false, mode, error: 'INVALID_SIGNATURE' });
        }
        try {
          const pad = body.length % 4 === 0 ? '' : '='.repeat(4 - (body.length % 4));
          const decoded = Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64').toString('utf8');
          const payload = JSON.parse(decoded) as { o: string; s: string; x: number };
          if (payload.x < Math.floor(Date.now() / 1000)) {
            return reply.status(403).send({ verified: false, mode, error: 'EXPIRED' });
          }
          if (payload.o !== id || payload.s !== store_id) {
            return reply.status(403).send({ verified: false, mode, error: 'TOKEN_ORDER_MISMATCH' });
          }
        } catch {
          return reply.status(403).send({ verified: false, mode, error: 'BAD_PAYLOAD' });
        }
        return reply.send({ verified: true, mode });
      }

      return reply.status(400).send({ verified: false, mode, error: 'UNKNOWN_MODE' });
    },
  );

  // POST /api/orders/scheduled — create a future-dated order (spec sec.19).
  // Lives in 'scheduled' state until promotion cron flips it to 'new' at
  // pickup_time - estimated_prep_minutes. Does NOT consume display_number until
  // promotion (avoids holding the 1-99 cycle hostage for hours).
  const scheduledBody = {
    type: 'object' as const,
    required: ['items', 'pickup_time'],
    properties: {
      customer_name:           { type: 'string',  maxLength: 60 },
      customer_phone:          { type: 'string',  maxLength: 20 },
      items:                   { type: 'array',   minItems: 1 },
      source:                  { type: 'string',  enum: ORDER_SOURCE as unknown as string[] },
      external_id:             { type: 'string',  maxLength: 80 },
      pickup_time:             { type: 'string',  format: 'date-time' },
      estimated_prep_minutes:  { type: 'integer', minimum: 1, maximum: 240 },
      priority:                { type: 'string',  enum: ['normal', 'rush', 'scheduled', 'catering'] },
    },
    additionalProperties: false,
  };

  interface ScheduledBody {
    customer_name?: string; customer_phone?: string;
    items: unknown[]; source?: OrderSource; external_id?: string;
    pickup_time: string;
    estimated_prep_minutes?: number;
    priority?: 'normal' | 'rush' | 'scheduled' | 'catering';
  }

  app.post<{ Body: ScheduledBody }>(
    '/scheduled',
    { preHandler: authenticate, schema: { body: scheduledBody } },
    async (req, reply) => {
      const { store_id, sub: userId } = req.user as JWTPayload;
      const b = req.body;
      // No display_number yet (assigned on promotion). Placeholder '0'.
      const [order] = await db.transaction(async (tx) => {
        const inserted = await tx.insert(orders).values({
          store_id,
          display_number: '0',
          customer_name:           b.customer_name,
          customer_phone:          b.customer_phone,
          items:                   JSON.stringify(b.items),
          source:                  b.source ?? 'manual',
          external_id:             b.external_id,
          pickup_time:             new Date(b.pickup_time),
          estimated_prep_minutes:  b.estimated_prep_minutes,
          priority:                b.priority ?? 'scheduled',
          status:                  'scheduled',
        }).returning();
        await tx.insert(order_state_transitions).values({
          store_id,
          order_id: inserted[0].id,
          from_status: null as unknown as OrderStatus,  // null FROM for first insert
          to_status: 'scheduled',
          actor: 'staff',
          actor_id: userId,
          reason: 'scheduled_create',
        });
        return inserted;
      });
      broadcast(store_id, 'order:new', order);
      return reply.status(201).send(order);
    },
  );

  // POST /api/orders/:id/remake — staff re-cooks an order. From ready/expired/collected
  // we move to 'remaking'; from 'prep' (in progress quality issue) we also accept it.
  // Spec sec.20.
  app.post<{ Params: { id: string }; Body: { reason?: string } }>(
    '/:id/remake',
    {
      preHandler: authenticate,
      schema: {
        body: {
          type: 'object',
          properties: { reason: { type: 'string', maxLength: 60 } },
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      const { store_id, sub: userId } = req.user as JWTPayload;
      const { id } = req.params;
      const { reason } = req.body ?? {};
      const [order] = await db.select().from(orders)
        .where(and(eq(orders.store_id, store_id), eq(orders.id, id)))
        .limit(1);
      if (!order) return reply.status(404).send({ error: 'ORDER_NOT_FOUND' });
      const REMAKE_FROM: OrderStatus[] = ['ready', 'collected', 'expired', 'prep', 'ready_to_expedite'];
      if (!REMAKE_FROM.includes(order.status as OrderStatus)) {
        return reply.status(422).send({ error: 'INVALID_REMAKE_STATE', current: order.status });
      }
      const [updated] = await db.transaction(async (tx) => {
        const u = await tx.update(orders)
          // Clear ready/picked_up/expired timestamps so re-completion is accurately measured.
          .set({ status: 'remaking', ready_at: null, picked_up_at: null, collected_at: null, expired_at: null })
          .where(and(eq(orders.store_id, store_id), eq(orders.id, id)))
          .returning();
        await tx.insert(order_state_transitions).values({
          store_id, order_id: id,
          from_status: order.status as OrderStatus,
          to_status: 'remaking',
          actor: 'staff', actor_id: userId, reason: reason ?? 'remake',
        });
        return u;
      });
      clearAllOrderTimers(id);
      broadcast(store_id, 'order:remake_started', { order_id: id, display_number: order.display_number });
      broadcast(store_id, 'order:status_changed', {
        order_id: id, status: 'remaking', display_number: order.display_number,
      });
      // No display:order_remove here — TV's markRemaking moves the card from
      // ready → remaking and PickupScreen renders the remaking bucket inside the
      // PREPARING column. Broadcasting order_remove would dropFromAllBuckets and
      // the card would disappear entirely (verified bug, 2026-05-16).
      return reply.send(updated);
    },
  );

  // POST /api/orders/:id/recall_tts — re-fire the ready announcement.
  // Useful when customer is slow to come pick up. Spec sec.20 + sec.11.2 step 10.
  app.post<{ Params: { id: string } }>(
    '/:id/recall_tts',
    { preHandler: authenticate },
    async (req, reply) => {
      const { store_id } = req.user as JWTPayload;
      const { id } = req.params;
      const [order] = await db.select().from(orders)
        .where(and(eq(orders.store_id, store_id), eq(orders.id, id)))
        .limit(1);
      if (!order) return reply.status(404).send({ error: 'ORDER_NOT_FOUND' });
      if (order.status !== 'ready') {
        return reply.status(422).send({ error: 'INVALID_RECALL_STATE', current: order.status });
      }
      broadcast(
        store_id,
        'display:order_ready',
        { display_number: order.display_number, flash: true, recall: true },
        (c) => c.device_type === 'tv' && c.role === 'pickup',
      );
      // Refresh the 30s ready_remove timer so the card stays up for another window.
      setOrderTimer(id, 'ready_remove', 30_000, () => {
        broadcast(
          store_id,
          'display:order_remove',
          { display_number: order.display_number },
          (c) => c.device_type === 'tv' && c.role === 'pickup',
        );
      });
      return reply.send({ ok: true });
    },
  );

  // POST /api/orders/_complete_all_ready — staff bulk marks all READY as PICKED_UP.
  // Used for end-of-rush cleanup. Spec sec.11.5.
  app.post('/_complete_all_ready', { preHandler: authenticate }, async (req, reply) => {
    const { store_id, sub: userId } = req.user as JWTPayload;
    const readyRows = await db
      .select({ id: orders.id, display_number: orders.display_number })
      .from(orders)
      .where(and(eq(orders.store_id, store_id), eq(orders.status, 'ready')));
    if (readyRows.length === 0) return reply.send({ completed: 0 });

    const now = new Date();
    await db.transaction(async (tx) => {
      await tx.update(orders)
        .set({ status: 'collected' as OrderStatus, collected_at: now, picked_up_at: now })
        .where(and(eq(orders.store_id, store_id), eq(orders.status, 'ready')));
      await tx.insert(order_state_transitions).values(
        readyRows.map((r) => ({
          store_id, order_id: r.id,
          from_status: 'ready' as OrderStatus,
          to_status: 'collected' as OrderStatus,
          actor: 'staff' as const,
          actor_id: userId,
          reason: 'complete_all_ready',
        })),
      );
    });
    for (const r of readyRows) {
      clearAllOrderTimers(r.id);
      broadcast(store_id, 'order:status_changed', {
        order_id: r.id, status: 'collected', display_number: r.display_number,
      });
      broadcast(
        store_id,
        'display:order_remove',
        { display_number: r.display_number },
        (c) => c.device_type === 'tv' && c.role === 'pickup',
      );
    }
    return reply.send({ completed: readyRows.length });
  });

  // POST /api/orders/_emergency_message — broadcast a one-shot message to all TVs.
  // Spec sec.11.5.
  app.post<{ Body: { message: string } }>(
    '/_emergency_message',
    {
      preHandler: authenticate,
      schema: {
        body: {
          type: 'object',
          required: ['message'],
          properties: { message: { type: 'string', minLength: 1, maxLength: 200 } },
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      const { store_id } = req.user as JWTPayload;
      const { message } = req.body;
      broadcast(store_id, 'display:emergency_message', { message, sent_at: new Date().toISOString() });
      return reply.send({ ok: true });
    },
  );

  // POST /api/orders/_purge_active — 일괄 cancel (테스트/엔지니어 모드용)
  // store_id 내 active(non-terminal) 모두 cancelled로 단일 UPDATE. 페이지네이션 불필요.
  // partial unique index `orders_active_dn_uniq`에서 cancelled/expired 행은 제외되므로
  // display_number가 즉시 재사용 가능. Redis display:counter 키는 유지 (멀티세션 안전).
  app.post('/_purge_active', { preHandler: authenticate }, async (req, reply) => {
    const { store_id, sub: userId } = req.user as JWTPayload;
    const ACTIVE: OrderStatus[] = ['new', 'prep', 'ready_to_expedite', 'ready', 'remaking', 'scheduled'];

    const activeRows = await db
      .select({ id: orders.id, display_number: orders.display_number, status: orders.status })
      .from(orders)
      .where(and(eq(orders.store_id, store_id), inArray(orders.status, ACTIVE)));

    for (const r of activeRows) clearAllOrderTimers(r.id);
    if (activeRows.length === 0) return reply.send({ cancelled: 0 });

    await db.transaction(async (tx) => {
      await tx.update(orders)
        .set({ status: 'cancelled' as OrderStatus })
        .where(and(eq(orders.store_id, store_id), inArray(orders.status, ACTIVE)));
      await tx.insert(order_state_transitions).values(
        activeRows.map((r) => ({
          store_id,
          order_id: r.id,
          from_status: r.status as OrderStatus,
          to_status: 'cancelled' as OrderStatus,
          actor: 'staff' as const,
          actor_id: userId,
          reason: 'purge_active',
        })),
      );
    });

    for (const r of activeRows) {
      broadcast(store_id, 'order:cancelled', { order_id: r.id, display_number: r.display_number });
      if (r.status === 'ready' || r.status === 'ready_to_expedite') {
        broadcast(
          store_id,
          'display:order_remove',
          { display_number: r.display_number },
          (c) => c.device_type === 'tv' && c.role === 'pickup',
        );
      }
    }

    return reply.send({ cancelled: activeRows.length });
  });
};

export default ordersPlugin;
