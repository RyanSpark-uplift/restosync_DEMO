// Sprint F.A — Featured Banner Rotation pool evaluation (PRD §3.6 / §4.2 / BR-21)
// Pool = is_featured=true ∪ menu_featured_rules matched items.
// Active rule_types: chef_pick / lto / daypart (P1) — low_inventory(P1.5) / analytics_*(P2) stub.
// Sort: rule.priority DESC, item.sort_order ASC, item.id ASC (AM01-019 deterministic tie-break).
// 결과 cap: limit (default 8).
//
// AG-013: DAYPART enum 정본. AG-024: stores.timezone 기준 daypart 계산 (UTC 직접 비교 금지).
// AG-001: store_id WHERE 필수 — 모든 쿼리.

import { and, eq, gte, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { db } from '../db/db';
import { menu_featured_rules, menu_items, stores } from '../db/schema';
import { DAYPART, type Daypart, type FeaturedRuleType } from '@restosync/shared/enums';

export interface FeaturedPoolItem {
  id:              string;
  name:            string | null;
  name_i18n:       Record<string, string> | null;
  description:     string | null;
  description_i18n: Record<string, string> | null;
  price_cents:     number | null;
  image_url:       string | null;
  photo_url_nobg:  string | null;
  is_featured:     boolean | null;
  is_hot:          boolean | null;
  sort_order:      number | null;
  category_id:     string | null;
  dayparts_arr:    string[] | null;
  matched_rules:   FeaturedRuleType[];
}

export interface FeaturedPool {
  items:            FeaturedPoolItem[];
  rotation_seconds: number;
  current_daypart:  Daypart | null;
  timezone:         string;
  active_rule_types: FeaturedRuleType[];
}

// AG-024: stores.timezone 로컬 시각 'HH:mm'으로 daypart match.
// stores.daypart_windows = { breakfast: {start, end}, lunch: ..., ... } — closed/wildcard 제외 매칭.
// 매칭 없으면 null 반환 (closed). 'late' overnight(예 21:00→02:00) 지원.
function localHHmm(tz: string, when: Date): string {
  const s = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz,
  }).format(when).replace(/^24:/, '00:');
  return s;
}

export function computeCurrentDaypart(
  now: Date,
  tz: string,
  windows: Record<string, { start: string; end: string }> | null | undefined,
): Daypart | null {
  if (!windows) return null;
  const hhmm = localHHmm(tz, now);
  for (const [name, win] of Object.entries(windows)) {
    if (!win || !win.start || !win.end) continue;
    if (!(DAYPART as readonly string[]).includes(name)) continue;
    if (name === 'all') continue;                                                // wildcard — skip explicit match
    const { start, end } = win;
    if (end > start) {
      if (hhmm >= start && hhmm < end) return name as Daypart;
    } else {
      // overnight (e.g., 21:00 → 02:00)
      if (hhmm >= start || hhmm < end) return name as Daypart;
    }
  }
  return null;
}

interface ItemRow {
  id:               string;
  name:             string | null;
  name_i18n:        Record<string, string> | null;
  description:      string | null;
  description_i18n: Record<string, string> | null;
  price_cents:      number | null;
  image_url:        string | null;
  photo_url_nobg:   string | null;
  is_featured:      boolean | null;
  is_hot:           boolean | null;
  sort_order:       number | null;
  category_id:      string | null;
  dayparts_arr:     string[] | null;
}

const ITEM_COLS = {
  id:               menu_items.id,
  name:             menu_items.name,
  name_i18n:        menu_items.name_i18n,
  description:      menu_items.description,
  description_i18n: menu_items.description_i18n,
  price_cents:      menu_items.price_cents,
  image_url:        menu_items.image_url,
  photo_url_nobg:   menu_items.photo_url_nobg,
  is_featured:      menu_items.is_featured,
  is_hot:           menu_items.is_hot,
  sort_order:       menu_items.sort_order,
  category_id:      menu_items.category_id,
  dayparts_arr:     menu_items.dayparts_arr,
} as const;

export async function evaluateFeaturedPool(
  store_id: string,
  opts: { now?: Date; limit?: number } = {},
): Promise<FeaturedPool> {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? 8;

  const [store] = await db.select({
    timezone:                  stores.timezone,
    daypart_windows:           stores.daypart_windows,
    featured_rotation_seconds: stores.featured_rotation_seconds,
  }).from(stores).where(eq(stores.id, store_id)).limit(1);

  if (!store) {
    throw Object.assign(new Error('STORE_NOT_FOUND'), { code: 'STORE_NOT_FOUND' });
  }

  const tz = store.timezone ?? 'America/Los_Angeles';
  const current_daypart = computeCurrentDaypart(now, tz, store.daypart_windows);

  const ruleRows = await db.select()
    .from(menu_featured_rules)
    .where(and(
      eq(menu_featured_rules.store_id, store_id),
      eq(menu_featured_rules.is_active, true),
    ));

  // BR-21 default: if NO rules configured for the store, treat chef_pick as implicitly active.
  // Once owner edits Page F, persisted rules win.
  const rules = ruleRows.length === 0
    ? [{ rule_type: 'chef_pick' as FeaturedRuleType, priority: 100, params: {} as Record<string, unknown> }]
    : ruleRows.map((r) => ({
        rule_type: r.rule_type as FeaturedRuleType,
        priority:  r.priority,
        params:    r.params,
      }));

  // Maps item_id → { item, max(priority), set<rule_type> }
  const pool = new Map<string, {
    item:           ItemRow;
    maxPriority:    number;
    matched:        Set<FeaturedRuleType>;
  }>();

  const merge = (items: ItemRow[], type: FeaturedRuleType, priority: number) => {
    for (const it of items) {
      const e = pool.get(it.id);
      if (e) {
        e.matched.add(type);
        if (priority > e.maxPriority) e.maxPriority = priority;
      } else {
        pool.set(it.id, { item: it, maxPriority: priority, matched: new Set([type]) });
      }
    }
  };

  for (const rule of rules) {
    if (rule.rule_type === 'chef_pick') {
      const rows = await db.select(ITEM_COLS).from(menu_items).where(and(
        eq(menu_items.store_id, store_id),
        eq(menu_items.is_featured, true),
        eq(menu_items.show_on_tv, true),
        eq(menu_items.sold_out, false),
        isNull(menu_items.deleted_at),
      ));
      merge(rows as ItemRow[], 'chef_pick', rule.priority);
      continue;
    }

    if (rule.rule_type === 'lto') {
      const days = Number((rule.params as { threshold_days?: number })?.threshold_days ?? 2);
      const cutoff = new Date(now.getTime() + days * 86_400_000);
      const rows = await db.select(ITEM_COLS).from(menu_items).where(and(
        eq(menu_items.store_id, store_id),
        eq(menu_items.show_on_tv, true),
        eq(menu_items.sold_out, false),
        isNotNull(menu_items.available_until),
        gte(menu_items.available_until, now),
        lte(menu_items.available_until, cutoff),
        isNull(menu_items.deleted_at),
      ));
      merge(rows as ItemRow[], 'lto', rule.priority);
      continue;
    }

    if (rule.rule_type === 'daypart') {
      if (current_daypart == null) continue;                                     // store closed → skip
      const rows = await db.select(ITEM_COLS).from(menu_items).where(and(
        eq(menu_items.store_id, store_id),
        eq(menu_items.show_on_tv, true),
        eq(menu_items.sold_out, false),
        isNull(menu_items.deleted_at),
        // overlap with current_daypart OR 'all' wildcard
        sql`${menu_items.dayparts_arr} && ARRAY[${current_daypart}, 'all']::text[]`,
      ));
      merge(rows as ItemRow[], 'daypart', rule.priority);
      continue;
    }

    // low_inventory(P1.5), analytics_star/puzzle(P2) — stubbed, no-op.
  }

  // Sort: matched priority DESC, sort_order ASC, id ASC (AM01-019)
  const sorted = [...pool.values()].sort((a, b) => {
    if (a.maxPriority !== b.maxPriority) return b.maxPriority - a.maxPriority;
    const aS = a.item.sort_order ?? 0;
    const bS = b.item.sort_order ?? 0;
    if (aS !== bS) return aS - bS;
    return a.item.id.localeCompare(b.item.id);
  });

  const items: FeaturedPoolItem[] = sorted.slice(0, limit).map(({ item, matched }) => ({
    id:               item.id,
    name:             item.name,
    name_i18n:        item.name_i18n,
    description:      item.description,
    description_i18n: item.description_i18n,
    price_cents:      item.price_cents,
    image_url:        item.image_url,
    photo_url_nobg:   item.photo_url_nobg,
    is_featured:      item.is_featured,
    is_hot:           item.is_hot,
    sort_order:       item.sort_order,
    category_id:      item.category_id,
    dayparts_arr:     item.dayparts_arr,
    matched_rules:    [...matched],
  }));

  return {
    items,
    rotation_seconds:  store.featured_rotation_seconds ?? 8,
    current_daypart,
    timezone:          tz,
    active_rule_types: rules.map((r) => r.rule_type),
  };
}
