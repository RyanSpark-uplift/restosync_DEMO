// AI prep time — Stage 1 (static lookup). Spec sec.26.
//
// Stage 1: store_settings.ai.prep_time_lookup is a map of item-name -> minutes.
// For an incoming order, we sum the max(item prep_minutes) (parallel cook) and
// multiply by peak_multiplier when local time is within the lunch/dinner window.
// range_buffer is used by the TV to render a "X-Y min" range.
//
// Stage 2 (future): persist features (items count, daypart, hour-of-week,
// recent_load) into order_features and replace the static call with an inference
// hook. Stage 1 already populates orders.estimated_prep_minutes so the TV
// experience works regardless.

import type { StoreSettings, DeepPartial } from '@restosync/shared/storeSettings';
import { defaultStoreSettings } from '@restosync/shared/storeSettings';

interface OrderItemShape {
  name?: string;
  sku?: string;
  qty?: number;
}

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

export interface PrepEstimateInput {
  items: unknown;                         // jsonb from POST body
  storedConfig?: DeepPartial<StoreSettings>;
  when?: Date;
  timezone?: string;                      // IANA tz; falls back to server tz.
}

export interface PrepEstimateResult {
  estimated_minutes: number;
  range_min: number;
  range_max: number;
  applied_peak_multiplier: boolean;
}

function lookupItemMinutes(item: OrderItemShape, table: Record<string, number>): number {
  const keyCandidates = [item.sku, item.name].filter((k): k is string => Boolean(k));
  for (const k of keyCandidates) {
    const lower = k.toLowerCase();
    if (table[k] !== undefined) return table[k];
    if (table[lower] !== undefined) return table[lower];
  }
  return 0;
}

function isPeakHour(settings: StoreSettings, when: Date, tz?: string): boolean {
  const fmt = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: false,
    ...(tz ? { timeZone: tz } : {}),
  });
  const hhmm = fmt.format(when).replace(/^24:/, '00:');
  const within = (a: string, b: string) => hhmm >= a && hhmm < b;
  const t = settings.timeout;
  return within(t.peak_start, t.peak_end);
}

// Pure function — no DB. Caller passes the stored config slice.
export function estimatePrepTime({ items, storedConfig, when = new Date(), timezone }: PrepEstimateInput): PrepEstimateResult {
  const settings = deepMerge(defaultStoreSettings(), storedConfig ?? {});
  const ai = settings.ai;
  const table = ai.prep_time_lookup ?? {};

  const list: OrderItemShape[] = Array.isArray(items) ? (items as OrderItemShape[]) : [];

  // Parallel cook model: longest item dominates; add a small per-extra-item buffer.
  const perItem = list.map((it) => lookupItemMinutes(it, table)).filter((n) => n > 0);
  let base = perItem.length === 0 ? 0 : Math.max(...perItem);
  if (perItem.length > 1) base += Math.min(perItem.length - 1, 5); // up to +5 min for batch overhead

  const applyPeak = isPeakHour(settings, when, timezone);
  const multiplied = applyPeak ? base * (ai.peak_multiplier ?? 1.3) : base;
  const estimated = Math.max(1, Math.round(multiplied));

  const buf = Math.max(0, Math.round(ai.range_buffer_minutes ?? 3));
  return {
    estimated_minutes: estimated,
    range_min: Math.max(1, estimated - buf),
    range_max: estimated + buf,
    applied_peak_multiplier: applyPeak,
  };
}
