// Sprint 1 S1.9~S1.13 — Menu Items routes (M01 PRD v1.2)
// AG-001 store_id WHERE / AG-013 정본 enum / AG-021 max limit + server-side filter
// AG-023 WS broadcast는 DB commit 후만 / BR-01 priceCents / BR-05 soft delete / BR-11 i18n
// BR-20 sync_source != 'restosync' → 403 / AM01-008 toggle-sold-out kitchen RBAC fast-path
//
// Legacy 호환: body에 `name`/`price` decimal 있으면 자동으로 name_i18n/price_cents 변환.

import type { FastifyPluginAsync } from 'fastify';
import { processMenuPhoto } from '../services/imageService';
import { eq, and, isNull, inArray, sql } from 'drizzle-orm';
import { db } from '../db/db';
import { menu_items } from '../db/schema';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { broadcast } from '../ws/broadcast';
import { logAudit } from '../services/audit';
import type { JWTPayload } from '../types';
import {
  MenuItemCreateSchema,
  MenuItemUpdateSchema,
  ToggleSoldOutSchema,
  MenuItemListQuerySchema,
  MenuSnapshotQuerySchema,
} from '../schemas/menu';
import { putRawObject, rawKey, isAnyStorageConfigured } from '../lib/r2Client';
import { enqueueTranscode, getTranscodeJob } from '../services/transcodeQueue';
import { getSnapshot, invalidateSnapshot } from '../services/menuSnapshot';
import type { SupportedLang } from '@restosync/shared';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
  'image/gif':  'gif',
};
// BR-04 — 사진 5MB 강제 (multipart 전역은 10MB; Excel import용으로 더 크게 잡혀있음).
const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

// Legacy body shim: { name, price } → { name_i18n, price_cents }
function legacyToCanonical(body: Record<string, unknown>): Record<string, unknown> {
  const out = { ...body };
  if (typeof out.name === 'string' && !out.name_i18n) {
    out.name_i18n = { en: out.name };
    delete out.name;
  }
  if (typeof out.price === 'number' && out.price_cents == null) {
    out.price_cents = Math.round(out.price * 100);
    delete out.price;
  }
  // legacy `dayparts` jsonb → `dayparts_arr` text[]
  if (Array.isArray(out.dayparts) && !out.dayparts_arr) {
    out.dayparts_arr = out.dayparts;
    delete out.dayparts;
  }
  return out;
}

const menuPlugin: FastifyPluginAsync = async (app) => {

  // POST /api/menu/upload — 사진 업로드 (AG-022 / AM01-005 BullMQ 분리)
  //
  // 모드:
  //  1) item_id 동봉 (권장 신규): R2 raw put → menu_items.photo_status='pending' → enqueue → 202
  //     → worker가 WebP transcode → image_url commit → display:menu_item_updated broadcast.
  //  2) item_id 없음: R2 raw put → 200 { raw_url } 반환. 클라가 POST /items에 image_url로 전달.
  //     transcode는 클라가 별도 호출 책임. (legacy flow — Sprint 3에서 제거 예정)
  //  3) ?legacy=true: 기존 동기 processMenuPhoto (remove.bg + drop shadow) → 200 { url }.
  //     R2/BullMQ 미설정 dev 환경 escape hatch + 기존 클라 호환.
  app.post<{ Querystring: { legacy?: string; item_id?: string } }>('/upload', {
    preHandler: [authenticate, requireRole(['owner', 'manager', 'staff'])],
  }, async (req, reply) => {
    const { store_id, sub: user_id } = req.user as JWTPayload;
    const data = await req.file({ limits: { fileSize: PHOTO_MAX_BYTES } });
    if (!data) return reply.status(400).send({ error: 'NO_FILE' });
    if (!ALLOWED_MIME.has(data.mimetype)) {
      return reply.status(400).send({ error: 'UNSUPPORTED_TYPE', mime: data.mimetype });
    }

    let buf: Buffer;
    try {
      buf = await data.toBuffer();
    } catch (err) {
      // @fastify/multipart throws when fileSize limit exceeded
      const msg = (err as Error).message ?? '';
      if (msg.includes('limit') || msg.includes('size')) {
        return reply.status(413).send({ error: 'FILE_TOO_LARGE', max_bytes: PHOTO_MAX_BYTES });
      }
      throw err;
    }
    if (buf.length > PHOTO_MAX_BYTES) {
      return reply.status(413).send({ error: 'FILE_TOO_LARGE', max_bytes: PHOTO_MAX_BYTES });
    }

    // Legacy escape hatch — Sprint 3 client cutover까지 유지.
    const wantsLegacy = req.query?.legacy === 'true' || req.query?.legacy === '1';
    if (wantsLegacy) {
      const url = await processMenuPhoto(buf, data.mimetype);
      return reply.send({ url });
    }

    // Storage 미설정 dev 환경 — legacy fallback (worker 분리 효과 없음, 기능만 유지).
    if (!isAnyStorageConfigured()) {
      const url = await processMenuPhoto(buf, data.mimetype);
      return reply.send({ url, fallback: 'no_storage_configured' });
    }

    // item_id 추출 — multipart form field (file 다음 fields). req.body는 multipart에서
    // @fastify/multipart의 attachFieldsToBody 옵션이 없으면 비어있어서 query param도 허용.
    const item_id =
      req.query?.item_id ??
      (data.fields?.item_id && 'value' in data.fields.item_id ? String(data.fields.item_id.value) : undefined);

    const ext = MIME_TO_EXT[data.mimetype] ?? 'bin';
    const key = rawKey(store_id, ext);
    const raw = await putRawObject(key, buf, data.mimetype);

    // item_id 없음 모드 — raw URL만 반환.
    if (!item_id) {
      return reply.send({ raw_url: raw.url, raw_key: raw.key, note: 'attach item_id to enable async transcode' });
    }

    // item ownership + alive 검증 (cross-store / soft-deleted 차단)
    const [target] = await db.select({
      id: menu_items.id,
      photo_status: menu_items.photo_status,
    })
      .from(menu_items)
      .where(and(
        eq(menu_items.store_id, store_id),
        eq(menu_items.id, item_id),
        isNull(menu_items.deleted_at),
      ))
      .limit(1);
    if (!target) return reply.status(404).send({ error: 'ITEM_NOT_FOUND' });

    const job = await enqueueTranscode({
      store_id,
      item_id,
      raw_key: raw.key,
      mime: data.mimetype,
      original_size: buf.length,
      user_id,
    });

    // photo_status='pending' + photo_job_id — worker pickup 시 'processing'으로 전환.
    // AM01-010 race guard: deleted_at IS NULL WHERE 유지.
    await db.update(menu_items)
      .set({
        photo_status: 'pending',
        photo_job_id: job?.id ?? null,
        updated_at: new Date(),
      })
      .where(and(
        eq(menu_items.store_id, store_id),
        eq(menu_items.id, item_id),
        isNull(menu_items.deleted_at),
      ));

    await logAudit({
      store_id, entity_type: 'menu_item', entity_id: item_id,
      operation: 'update', user_id, reason: 'photo_upload_queued',
      before: { photo_status: target.photo_status },
      after:  { photo_status: 'pending', photo_job_id: job?.id ?? null, raw_key: raw.key },
    }, req.log);

    return reply.status(202).send({
      job_id:  job?.id ?? null,
      item_id,
      raw_url: raw.url,
      status:  job ? 'queued' : 'no_queue',
    });
  });

  // ── GET /api/menu/snapshot (S2.15) ───────────────────────────────────────
  // BR-03: TV가 1회 호출로 모든 zone을 채울 minimal payload.
  // Redis 60s TTL + ETag + If-None-Match → 304. AG-001: store_id JWT 강제.
  app.get('/snapshot', { preHandler: authenticate }, async (req, reply) => {
    const { store_id } = req.user as JWTPayload;
    const parsed = MenuSnapshotQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'INVALID_QUERY', issues: parsed.error.issues });
    }
    // lang: query > stores.default_language. snapshot이 default_language도 반환하므로
    // 클라이언트가 첫 호출 후 그 값을 보고 다음 호출부터 명시할 수 있음.
    const lang: SupportedLang = parsed.data.lang ?? 'en';

    const { snapshot, etag, cache } = await getSnapshot(store_id, lang);

    const ifNoneMatch = req.headers['if-none-match'];
    if (ifNoneMatch && ifNoneMatch === etag) {
      reply.header('ETag', etag);
      reply.header('Cache-Control', 'private, max-age=60');
      reply.header('X-RestoSync-Cache', 'HIT-304');
      return reply.status(304).send();
    }

    reply.header('ETag', etag);
    reply.header('Cache-Control', 'private, max-age=60');
    reply.header('X-RestoSync-Cache', cache);
    return reply.send(snapshot);
  });

  // GET /api/menu/upload/jobs/:id — transcode job 폴링 (S2.9)
  // ownership: job.data.store_id == requester.store_id
  app.get<{ Params: { id: string } }>('/upload/jobs/:id', {
    preHandler: [authenticate, requireRole(['owner', 'manager', 'staff', 'kitchen'])],
  }, async (req, reply) => {
    const { store_id } = req.user as JWTPayload;
    const info = await getTranscodeJob(req.params.id);
    if (!info) return reply.status(404).send({ error: 'JOB_NOT_FOUND' });
    if (info.store_id && info.store_id !== store_id) {
      return reply.status(403).send({ error: 'CROSS_STORE_FORBIDDEN' });
    }
    return reply.send(info);
  });

  // ── GET /api/menu/items (S1.9) ───────────────────────────────────────────
  // AG-021: max limit + server-side filter. AG-001: store_id WHERE.
  // BR-05: deleted_at IS NULL.
  app.get('/items', { preHandler: authenticate }, async (req, reply) => {
    const { store_id } = req.user as JWTPayload;
    const parsed = MenuItemListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'INVALID_QUERY', issues: parsed.error.issues });
    }
    const q = parsed.data;

    const conditions = [
      eq(menu_items.store_id, store_id),
      isNull(menu_items.deleted_at),
    ];
    if (q.category_id) conditions.push(eq(menu_items.category_id, q.category_id));
    if (q.show_on_tv !== undefined) conditions.push(eq(menu_items.show_on_tv, q.show_on_tv));
    if (q.is_featured !== undefined) conditions.push(eq(menu_items.is_featured, q.is_featured));
    if (q.sync_source) conditions.push(eq(menu_items.sync_source, q.sync_source));
    // daypart filter: dayparts_arr @> ARRAY[daypart] OR @> ARRAY['all']
    if (q.daypart) {
      conditions.push(sql`(${menu_items.dayparts_arr} @> ARRAY[${q.daypart}]::text[] OR ${menu_items.dayparts_arr} @> ARRAY['all']::text[])`);
    }
    // AG-021 default: status='active' (Zod default) → sold_out 제외.
    // 'archived'는 P1.5에서 컬럼 추가 시 활성. 'any'는 명시 opt-in (어드민/디버그용).
    if (q.status === 'sold_out')    conditions.push(eq(menu_items.sold_out, true));
    else if (q.status === 'active') conditions.push(eq(menu_items.sold_out, false));
    // 'any' or 'archived': no additional filter (archived는 P1.5)

    const rows = await db
      .select()
      .from(menu_items)
      .where(and(...conditions))
      // BR-13 — ASC sort_order, then created_at, then id as deterministic
      // tiebreaker. Without id, rows with equal sort_order+created_at (seed data
      // inserted in the same tx) can swap positions after any UPDATE that
      // touches the table (e.g. sold_out toggle) — caused visible card reorder
      // in Page A after 86-toggle. PG ORDER BY is unstable for ties.
      .orderBy(menu_items.sort_order, menu_items.created_at, menu_items.id)
      .limit(q.limit)
      .offset(q.offset);

    return reply.send(rows);
  });

  // ── POST /api/menu/items (S1.10) ─────────────────────────────────────────
  // legacy body 호환. Zod 검증. Audit + WS commit 후 (AG-023).
  app.post('/items', {
    preHandler: [authenticate, requireRole(['owner', 'manager', 'staff'])],
  }, async (req, reply) => {
    const { store_id, sub: user_id } = req.user as JWTPayload;
    const normalized = legacyToCanonical((req.body ?? {}) as Record<string, unknown>);
    const parsed = MenuItemCreateSchema.safeParse(normalized);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'INVALID_BODY', issues: parsed.error.issues });
    }
    const data = parsed.data;

    const [item] = await db.insert(menu_items).values({
      store_id,
      // ── 정본 컬럼 ──
      name_i18n:        data.name_i18n,
      description_i18n: data.description_i18n,
      category_id:      data.category_id,
      price_cents:      data.price_cents,
      dayparts_arr:     data.dayparts_arr,
      allergens:        data.allergens,
      calories:         data.calories,
      spice_level:      data.spice_level,
      available_from:   data.available_from ? new Date(data.available_from) : null,
      available_until:  data.available_until ? new Date(data.available_until) : null,
      is_featured:      data.is_featured,
      is_hot:           data.is_hot,
      show_on_tv:       data.show_on_tv,
      sort_order:       data.sort_order,
      kitchen_name:     data.kitchen_name,
      tax_policy:       data.tax_policy,
      tax_category_id:  data.tax_category_id,
      external_id:      data.external_id,
      image_url:        data.image_url,
      // sync_source는 default 'restosync' — POST에서는 클라가 변경 불가
      // ── Legacy 컬럼 mirror (코드 마이그레이션 중간단계) ──
      name:             data.name_i18n.en,
      description:      data.description_i18n?.en,
      price:            (data.price_cents / 100).toFixed(2),
      available:        true,
    }).returning();

    await logAudit({
      store_id, entity_type: 'menu_item', entity_id: item.id,
      operation: 'create', user_id, after: item as unknown as Record<string, unknown>,
    }, req.log);

    // AM01-013: audit → invalidate → broadcast. TV가 broadcast 받자마자 GET /snapshot 하면
    // stale 캐시 안 보도록 invalidate 먼저.
    await invalidateSnapshot(store_id);

    broadcast(store_id, 'display:menu_item_added', { item },
      (c) => c.device_type === 'tablet' || (c.device_type === 'tv' && c.role === 'menu'));

    return reply.status(201).send(item);
  });

  // ── GET /api/menu/items/:id (S4.1a — Page B Item Edit) ───────────────────
  // AG-001 store_id WHERE / BR-05 deleted_at IS NULL. 404로 cross-store / soft-deleted 모두 차단.
  app.get<{ Params: { id: string } }>('/items/:id', { preHandler: authenticate }, async (req, reply) => {
    const { store_id } = req.user as JWTPayload;
    const { id } = req.params;
    const [item] = await db.select().from(menu_items)
      .where(and(eq(menu_items.store_id, store_id), eq(menu_items.id, id), isNull(menu_items.deleted_at)))
      .limit(1);
    if (!item) return reply.status(404).send({ error: 'ITEM_NOT_FOUND' });
    return reply.send(item);
  });

  // ── PATCH /api/menu/items/:id (S1.11) ───────────────────────────────────
  // BR-20 sync_source guard
  app.patch<{ Params: { id: string } }>('/items/:id', {
    preHandler: [authenticate, requireRole(['owner', 'manager', 'staff'])],
  }, async (req, reply) => {
    const { store_id, sub: user_id } = req.user as JWTPayload;
    const { id } = req.params;

    const normalized = legacyToCanonical((req.body ?? {}) as Record<string, unknown>);
    const parsed = MenuItemUpdateSchema.safeParse(normalized);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'INVALID_BODY', issues: parsed.error.issues });
    }
    const data = parsed.data;

    // 1. before snapshot + sync_source guard
    const [before] = await db.select().from(menu_items)
      .where(and(eq(menu_items.store_id, store_id), eq(menu_items.id, id), isNull(menu_items.deleted_at)))
      .limit(1);
    if (!before) return reply.status(404).send({ error: 'ITEM_NOT_FOUND' });

    // BR-20 — POS-managed item is read-only for our PATCH
    if (before.sync_source !== 'restosync') {
      return reply.status(403).send({
        error: 'EXTERNAL_SYNC_LOCKED',
        sync_source: before.sync_source,
        message: 'Item is mastered by external POS. Modify in source system or detach sync.',
      });
    }

    // 2. update fields (mirror legacy columns)
    const fields: Record<string, unknown> = { updated_at: new Date() };
    if (data.name_i18n !== undefined) {
      fields.name_i18n = data.name_i18n;
      fields.name = data.name_i18n.en;
    }
    if (data.description_i18n !== undefined) {
      fields.description_i18n = data.description_i18n;
      fields.description = data.description_i18n.en ?? null;
    }
    if (data.price_cents !== undefined) {
      fields.price_cents = data.price_cents;
      fields.price = (data.price_cents / 100).toFixed(2);
    }
    for (const k of [
      'category_id','dayparts_arr','allergens','calories','spice_level',
      'is_featured','is_hot','show_on_tv','sort_order','kitchen_name',
      'tax_policy','tax_category_id','external_id','image_url',
    ] as const) {
      if ((data as Record<string, unknown>)[k] !== undefined) fields[k] = (data as Record<string, unknown>)[k];
    }
    if (data.available_from !== undefined) {
      fields.available_from = data.available_from ? new Date(data.available_from) : null;
    }
    if (data.available_until !== undefined) {
      fields.available_until = data.available_until ? new Date(data.available_until) : null;
    }

    // WARN-race: deleted_at IS NULL guard prevents resurrection if soft-delete races SELECT→UPDATE.
    const [updated] = await db.update(menu_items)
      .set(fields)
      .where(and(eq(menu_items.store_id, store_id), eq(menu_items.id, id), isNull(menu_items.deleted_at)))
      .returning();
    if (!updated) return reply.status(404).send({ error: 'ITEM_NOT_FOUND' });

    await logAudit({
      store_id, entity_type: 'menu_item', entity_id: id,
      operation: data.price_cents !== undefined ? 'price_change' : 'update',
      user_id, before: before as unknown as Record<string, unknown>,
      after: updated as unknown as Record<string, unknown>,
    }, req.log);

    await invalidateSnapshot(store_id);  // AM01-013

    broadcast(store_id, 'display:menu_item_updated', { item: updated },
      (c) => c.device_type === 'tablet' || (c.device_type === 'tv' && c.role === 'menu'));

    return reply.send(updated);
  });

  // ── PATCH /api/menu/items/:id/toggle-sold-out (S1.13 — kitchen RBAC fast-path) ─
  // AM01-008: kitchen 권한 허용. 일반 PATCH는 owner/manager/staff만.
  app.patch<{ Params: { id: string } }>('/items/:id/toggle-sold-out', {
    preHandler: [authenticate, requireRole(['owner', 'manager', 'staff', 'kitchen'])],
  }, async (req, reply) => {
    const { store_id, sub: user_id } = req.user as JWTPayload;
    const { id } = req.params;
    const parsed = ToggleSoldOutSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'INVALID_BODY', issues: parsed.error.issues });
    }
    const { sold_out, reason } = parsed.data;

    const [before] = await db.select().from(menu_items)
      .where(and(eq(menu_items.store_id, store_id), eq(menu_items.id, id), isNull(menu_items.deleted_at)))
      .limit(1);
    if (!before) return reply.status(404).send({ error: 'ITEM_NOT_FOUND' });

    const [updated] = await db.update(menu_items)
      .set({ sold_out, available: !sold_out, updated_at: new Date() })  // legacy `available` mirror
      .where(and(eq(menu_items.store_id, store_id), eq(menu_items.id, id), isNull(menu_items.deleted_at)))
      .returning();
    if (!updated) return reply.status(404).send({ error: 'ITEM_NOT_FOUND' });

    await logAudit({
      store_id, entity_type: 'menu_item', entity_id: id,
      operation: 'sold_out_toggle', user_id, reason,
      before: { sold_out: before.sold_out }, after: { sold_out: updated.sold_out },
    }, req.log);

    await invalidateSnapshot(store_id);  // AM01-013

    broadcast(store_id, 'display:menu_item_sold_out_toggled',
      { item_id: id, sold_out: updated.sold_out },
      (c) => c.device_type === 'tablet' || (c.device_type === 'tv' && c.role === 'menu'));

    return reply.send(updated);
  });

  // ── PATCH /api/menu/items/:id/toggle (legacy — M02/M04 호환) ─────────────
  // Sprint 1.5 정책 명문화 [AM01-008]: 이 엔드포인트는 sold-out 토글과 의미가 동일하므로
  // kitchen 권한 허용은 의도된 동작. 클라이언트가 toggle-sold-out으로 전환 완료되면 Sprint 6에서 410 Gone.
  // 응답에 Deprecation 헤더로 마이그레이션 유도.
  app.patch<{ Params: { id: string } }>('/items/:id/toggle', {
    preHandler: [authenticate, requireRole(['owner', 'manager', 'staff', 'kitchen'])],
  }, async (req, reply) => {
    reply.header('Deprecation', 'true');
    reply.header('Sunset', 'Sprint-6');
    reply.header('Link', '</api/menu/items/:id/toggle-sold-out>; rel="successor-version"');
    const { store_id, sub: user_id } = req.user as JWTPayload;
    const { id } = req.params;

    const [current] = await db.select().from(menu_items)
      .where(and(eq(menu_items.store_id, store_id), eq(menu_items.id, id), isNull(menu_items.deleted_at)))
      .limit(1);
    if (!current) return reply.status(404).send({ error: 'ITEM_NOT_FOUND' });

    const newAvailable = !current.available;
    const [updated] = await db.update(menu_items)
      .set({ available: newAvailable, sold_out: !newAvailable, updated_at: new Date() })
      .where(and(eq(menu_items.store_id, store_id), eq(menu_items.id, id), isNull(menu_items.deleted_at)))
      .returning();
    if (!updated) return reply.status(404).send({ error: 'ITEM_NOT_FOUND' });

    await logAudit({
      store_id, entity_type: 'menu_item', entity_id: id,
      operation: 'sold_out_toggle', user_id,
      before: { available: current.available }, after: { available: updated.available },
    }, req.log);

    await invalidateSnapshot(store_id);  // AM01-013

    // Legacy + new event 둘 다 발사 (M01 TV는 새 이벤트 수신, M02/M04는 legacy)
    broadcast(store_id, 'display:item_toggle',
      { item_id: id, available: updated.available },
      (c) => c.device_type === 'tablet' || (c.device_type === 'tv' && c.role === 'menu'));
    broadcast(store_id, 'display:menu_item_sold_out_toggled',
      { item_id: id, sold_out: !updated.available },
      (c) => c.device_type === 'tablet' || (c.device_type === 'tv' && c.role === 'menu'));

    return reply.send(updated);
  });

  // ── DELETE /api/menu/items/:id (S1.12 — soft, BR-05) ────────────────────
  app.delete<{ Params: { id: string } }>('/items/:id', {
    preHandler: [authenticate, requireRole(['owner', 'manager'])],
  }, async (req, reply) => {
    const { store_id, sub: user_id } = req.user as JWTPayload;
    const { id } = req.params;

    const [before] = await db.select().from(menu_items)
      .where(and(eq(menu_items.store_id, store_id), eq(menu_items.id, id), isNull(menu_items.deleted_at)))
      .limit(1);
    if (!before) return reply.status(404).send({ error: 'ITEM_NOT_FOUND' });

    // soft delete — idempotent guard: only delete if still alive
    const now = new Date();
    await db.update(menu_items)
      .set({ deleted_at: now, updated_at: now })
      .where(and(eq(menu_items.store_id, store_id), eq(menu_items.id, id), isNull(menu_items.deleted_at)));

    await logAudit({
      store_id, entity_type: 'menu_item', entity_id: id,
      operation: 'delete', user_id, before: before as unknown as Record<string, unknown>,
    }, req.log);

    await invalidateSnapshot(store_id);  // AM01-013

    broadcast(store_id, 'display:menu_item_removed', { item_id: id },
      (c) => c.device_type === 'tablet' || (c.device_type === 'tv' && c.role === 'menu'));

    return reply.status(204).send();
  });
};

export default menuPlugin;
