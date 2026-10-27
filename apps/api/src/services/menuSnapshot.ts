// Menu snapshot service — Sprint 2 S2.14 (BR-03 / AG-001 / AG-024)
//
// TV가 1회 호출로 모든 zone(Featured + Grid + Category 탭)을 채우는 minimal payload를
// 빌드하고 Redis에 60s TTL로 캐싱한다. mutation route는 invalidateSnapshot()을
// commit 직후 호출 → broadcast 전에 cache stale 제거.
//
// AG-001 store_id WHERE 강제. AG-024 timezone 기반 daypart 계산.
// AG-023 caller가 broadcast 직전에 invalidate 호출 (race 회피).

import { and, eq, isNull, asc } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { db } from '../db/db';
import { redis } from '../db/redis';
import { stores, menu_categories, menu_items } from '../db/schema';
import {
  SUPPORTED_LANG,
  type Daypart,
  type SupportedLang,
  type Allergen,
  type SpiceLevel,
  type TaxPolicy,
  type MenuSnapshot,
  type MenuSnapshotItem,
  type MenuSnapshotCategory,
  type MenuSnapshotDaypartWindow,
  type I18nString,
} from '@restosync/shared';

export const SNAPSHOT_TTL_SEC = 60;       // BR-03
const KEY_PREFIX = 'snapshot:menu';

function cacheKey(storeId: string, lang: SupportedLang): string {
  return `${KEY_PREFIX}:${storeId}:${lang}`;
}

// HH:MM (매장 timezone)
function localHHmm(tz: string): string {
  return new Date().toLocaleTimeString('en-GB', {
    hour:   '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: tz,
  });
}

function hhmmInRange(now: string, start: string, end: string): boolean {
  if (start <= end) return now >= start && now < end;
  // 야간 윈도우 — 21:00 ~ 02:00 ('late' 등)
  return now >= start || now < end;
}

export function resolveCurrentDaypart(
  windows: ReadonlyArray<MenuSnapshotDaypartWindow>,
  timezone: string,
): Daypart | null {
  if (!windows.length) return null;
  const now = localHHmm(timezone);
  for (const w of windows) {
    if (w.name === 'all') continue;       // wildcard는 매칭 후보 아님
    if (hhmmInRange(now, w.start, w.end)) return w.name;
  }
  return null;
}

function normaliseWindows(
  raw: Record<string, { start: string; end: string }> | null | undefined,
): MenuSnapshotDaypartWindow[] {
  if (!raw) return [];
  const order: Daypart[] = ['breakfast', 'lunch', 'snack', 'dinner', 'late', 'all'];
  const out: MenuSnapshotDaypartWindow[] = [];
  for (const name of order) {
    const w = raw[name];
    if (w && typeof w.start === 'string' && typeof w.end === 'string') {
      out.push({ name, start: w.start, end: w.end });
    }
  }
  return out;
}

// ── buildSnapshot ────────────────────────────────────────────────────────────
export async function buildSnapshot(
  storeId: string,
  lang: SupportedLang,
): Promise<MenuSnapshot> {
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!store) throw new Error(`STORE_NOT_FOUND ${storeId}`);

  const cats = await db.select().from(menu_categories)
    .where(and(
      eq(menu_categories.store_id, storeId),
      isNull(menu_categories.deleted_at),
    ))
    .orderBy(asc(menu_categories.sort_order), asc(menu_categories.created_at));

  const items = await db.select().from(menu_items)
    .where(and(
      eq(menu_items.store_id, storeId),
      isNull(menu_items.deleted_at),
      eq(menu_items.show_on_tv, true),
    ))
    .orderBy(asc(menu_items.sort_order), asc(menu_items.created_at));

  const windows = normaliseWindows(store.daypart_windows);
  const timezone = store.timezone ?? 'America/Los_Angeles';
  const defaultLang = (store.default_language ?? 'en') as SupportedLang;

  const categories: MenuSnapshotCategory[] = cats.map((c) => ({
    id:         c.id,
    name_i18n:  (c.name ?? {}) as I18nString,
    icon:       c.icon ?? null,
    sort_order: c.sort_order ?? 0,
    is_active:  c.is_active ?? true,
  }));

  const snapItems: MenuSnapshotItem[] = items.map((it) => {
    // BR-11: name_i18n fallback to legacy `name` (en) so old data renders.
    const nameI18n: I18nString = (it.name_i18n as I18nString) ?? { en: it.name };
    const descI18n: I18nString | null =
      (it.description_i18n as I18nString | null) ?? (it.description ? { en: it.description } : null);
    return {
      id:               it.id,
      category_id:      it.category_id ?? null,
      name_i18n:        nameI18n,
      description_i18n: descI18n,
      price_cents:      it.price_cents ?? Math.round(parseFloat(it.price ?? '0') * 100),
      image_url:        it.image_url ?? null,
      dayparts:         (it.dayparts_arr ?? []) as readonly Daypart[],
      allergens:        (it.allergens ?? []) as readonly Allergen[],
      spice_level:      (it.spice_level as SpiceLevel | null) ?? null,
      calories:         it.calories ?? null,
      sort_order:       it.sort_order ?? 0,
      is_featured:      it.is_featured ?? false,
      is_hot:           it.is_hot ?? false,
      sold_out:         it.sold_out ?? false,
      show_on_tv:       it.show_on_tv ?? true,
      available_from:   it.available_from ? new Date(it.available_from).toISOString() : null,
      available_until:  it.available_until ? new Date(it.available_until).toISOString() : null,
      tax_policy:       (it.tax_policy as TaxPolicy) ?? 'exclusive',
      photo_status:     (it.photo_status as MenuSnapshotItem['photo_status']) ?? null,
    };
  });

  return {
    store_id:            storeId,
    generated_at:        new Date().toISOString(),
    ttl_sec:             SNAPSHOT_TTL_SEC,
    lang,
    current_daypart:     resolveCurrentDaypart(windows, timezone),
    timezone,
    default_language:    defaultLang,
    supported_languages: (store.supported_languages ?? ['en']) as readonly SupportedLang[],
    currency:            store.currency ?? 'USD',
    daypart_windows:     windows,
    categories,
    items:               snapItems,
  };
}

// ── computeEtag ──────────────────────────────────────────────────────────────
// 안정적인 직렬화 — JSON.stringify는 키 삽입 순서 의존이지만 buildSnapshot이
// 항상 동일 키 순서로 객체를 만들므로 충분히 결정적. 가격/sold_out 변경 시 etag 변동.
export function computeEtag(snapshot: MenuSnapshot): string {
  const hash = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  return `"${hash.slice(0, 27)}"`;       // weak ETag short form, RFC 7232 compatible
}

// ── getSnapshot — Redis cache + cold fill ────────────────────────────────────
export async function getSnapshot(
  storeId: string,
  lang: SupportedLang,
): Promise<{ snapshot: MenuSnapshot; etag: string; cache: 'HIT' | 'MISS' }> {
  const k = cacheKey(storeId, lang);
  try {
    const cached = await redis.get(k);
    if (cached) {
      const parsed = JSON.parse(cached) as { snapshot: MenuSnapshot; etag: string };
      return { ...parsed, cache: 'HIT' };
    }
  } catch {
    // redis 장애 — 그냥 cold path 진행
  }

  const snapshot = await buildSnapshot(storeId, lang);
  const etag = computeEtag(snapshot);
  try {
    await redis.set(k, JSON.stringify({ snapshot, etag }), 'EX', SNAPSHOT_TTL_SEC);
  } catch {
    // redis 장애 — 응답은 정상 반환
  }
  return { snapshot, etag, cache: 'MISS' };
}

// ── invalidateSnapshot — mutation route가 broadcast 직전에 호출 ───────────────
// 5-lang 키 일괄 삭제. wildcard SCAN 대신 명시적 DEL로 prod 부하 최소화.
export async function invalidateSnapshot(storeId: string): Promise<void> {
  const keys = SUPPORTED_LANG.map((l) => cacheKey(storeId, l));
  try {
    await redis.del(...keys);
    // metrics — 24h sliding counter (audit:fail 패턴 동일)
    await redis.multi()
      .incr(`snapshot:invals:${storeId}`)
      .expire(`snapshot:invals:${storeId}`, 24 * 60 * 60)
      .exec();
  } catch {
    // redis 장애 — 캐시는 60s 뒤 자동 만료
  }
}
