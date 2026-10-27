// Offline-first persistence for the TV display state (resilience reqs R1/R2/R3).
//
// The TV MUST keep showing its last loaded content through any upstream outage —
// internet loss, the tablet/server rebooting, or its own power-cycle. To do that
// the display-relevant slice of the store is snapshotted to AsyncStorage and
// re-hydrated on boot so the screen renders from cache *before* (and regardless
// of) the network coming back.
//
// This module is intentionally PURE — no AsyncStorage, no react-native imports —
// so the snapshot/restore logic is unit-testable in a plain node environment.
// tvStore.ts owns the actual AsyncStorage read/write + debounce glue.

import type {
  Order, TvRow, StoreSettingsShape, MenuItemData, EventData,
} from './tvStore';

export const CACHE_KEY = 'tv_display_cache_v1';
const SNAPSHOT_VERSION = 1 as const;

type Daypart = 'breakfast' | 'lunch' | 'dinner' | 'all';
type FeaturedRotation = 5 | 8 | 10 | 12;

// The display-relevant fields. Credentials (id/url) and volatile connection
// fields (wsStatus, wsRetry, appState, errorMsg) are deliberately excluded —
// they must NOT be restored from cache.
export interface TvSnapshot {
  v: typeof SNAPSHOT_VERSION;
  tvRow:        TvRow | null;
  preparing:    Order[];
  expediting:   Order[];
  ready:        Order[];
  remaking:     Order[];
  scheduled:    Order[];
  storeSettings:           StoreSettingsShape;
  currentDaypart:          Daypart;
  menuItems:               MenuItemData[];
  featuredItems:           MenuItemData[];
  featuredRotationSeconds: FeaturedRotation;
  currentEvent:            EventData | null;
}

// Structural input — any object carrying the snapshot fields (the live store state).
export type SnapshotInput = Omit<TvSnapshot, 'v'>;

const EMPTY_ORDERS = (): Order[] => [];

/** Pick the display slice out of the live store state. */
export function buildSnapshot(s: SnapshotInput): TvSnapshot {
  return {
    v: SNAPSHOT_VERSION,
    tvRow:        s.tvRow,
    preparing:    s.preparing,
    expediting:   s.expediting,
    ready:        s.ready,
    remaking:     s.remaking,
    scheduled:    s.scheduled,
    storeSettings:           s.storeSettings,
    currentDaypart:          s.currentDaypart,
    menuItems:               s.menuItems,
    featuredItems:           s.featuredItems,
    featuredRotationSeconds: s.featuredRotationSeconds,
    currentEvent:            s.currentEvent,
  };
}

export function serialize(snapshot: TvSnapshot): string {
  return JSON.stringify(snapshot);
}

/**
 * Parse a persisted snapshot. Returns null on anything unexpected (missing,
 * malformed JSON, wrong/absent version) so a corrupt cache can never crash boot —
 * the app simply falls back to a normal (network) boot.
 */
export function deserialize(raw: string | null | undefined): TvSnapshot | null {
  if (!raw) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return null; }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const p = parsed as Record<string, unknown>;
  if (p.v !== SNAPSHOT_VERSION) return null;

  const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  const daypart = (['breakfast', 'lunch', 'dinner', 'all'] as const)
    .includes(p.currentDaypart as Daypart) ? (p.currentDaypart as Daypart) : 'all';
  const rotation = ([5, 8, 10, 12] as const)
    .includes(p.featuredRotationSeconds as FeaturedRotation)
    ? (p.featuredRotationSeconds as FeaturedRotation) : 8;

  return {
    v: SNAPSHOT_VERSION,
    tvRow:        (p.tvRow as TvRow | null) ?? null,
    preparing:    arr<Order>(p.preparing),
    expediting:   arr<Order>(p.expediting),
    ready:        arr<Order>(p.ready),
    remaking:     arr<Order>(p.remaking),
    scheduled:    arr<Order>(p.scheduled),
    storeSettings:  (p.storeSettings as StoreSettingsShape) ?? null,
    currentDaypart: daypart,
    menuItems:      arr<MenuItemData>(p.menuItems),
    featuredItems:  arr<MenuItemData>(p.featuredItems),
    featuredRotationSeconds: rotation,
    currentEvent:   (p.currentEvent as EventData | null) ?? null,
  };
}

/** True when the snapshot carries enough to render the display offline (R2/R3). */
export function isRenderable(snap: TvSnapshot | null): snap is TvSnapshot {
  return !!snap && !!snap.tvRow;
}

export { EMPTY_ORDERS };
