import { describe, it, expect } from 'vitest';
import {
  buildSnapshot, serialize, deserialize, isRenderable, CACHE_KEY,
  type SnapshotInput,
} from './tvPersist';

// Minimal fixtures — only the fields the snapshot touches.
const order = (n: string, status: string) => ({
  id: `id-${n}`, display_number: n, customer_name: null,
  status, source: 'manual', created_at: '2026-06-07T00:00:00Z',
  venue_label: null, venue_color: null,
}) as any;

const tvRow = {
  instance: {
    id: 'tv-1', store_id: 'store-1', display_name: 'Pickup',
    function_type: 'pickup', profile_id: null, ip_address: null,
    is_active: true, last_ping_at: null, sort_order: 0,
  },
  profile: null,
} as any;

const fullState = (): SnapshotInput => ({
  tvRow,
  preparing:  [order('1', 'prep')],
  expediting: [],
  ready:      [order('42', 'ready')],
  remaking:   [],
  scheduled:  [],
  storeSettings: { display: { ready_auto_remove_enabled: false } },
  currentDaypart: 'lunch',
  menuItems: [],
  featuredItems: [],
  featuredRotationSeconds: 10,
  currentEvent: null,
});

describe('tvPersist', () => {
  it('buildSnapshot picks the display slice and stamps the version', () => {
    const snap = buildSnapshot(fullState());
    expect(snap.v).toBe(1);
    expect(snap.tvRow).toBe(tvRow);
    expect(snap.ready.map((o) => o.display_number)).toEqual(['42']);
    expect(snap.currentDaypart).toBe('lunch');
    expect(snap.featuredRotationSeconds).toBe(10);
  });

  it('round-trips through serialize -> deserialize', () => {
    const snap = buildSnapshot(fullState());
    const back = deserialize(serialize(snap));
    expect(back).not.toBeNull();
    expect(back!.ready[0].display_number).toBe('42');
    expect(back!.preparing[0].display_number).toBe('1');
    expect(back!.storeSettings).toEqual({ display: { ready_auto_remove_enabled: false } });
    expect(back!.tvRow!.instance.function_type).toBe('pickup');
  });

  it('deserialize returns null for missing / malformed / wrong-version input', () => {
    expect(deserialize(null)).toBeNull();
    expect(deserialize(undefined)).toBeNull();
    expect(deserialize('not json')).toBeNull();
    expect(deserialize('"a string"')).toBeNull();
    expect(deserialize(JSON.stringify({ v: 99, ready: [] }))).toBeNull();
  });

  it('deserialize coerces bad enum/array fields to safe defaults (corrupt cache never crashes boot)', () => {
    const raw = JSON.stringify({
      v: 1, tvRow,
      preparing: 'oops', ready: null,
      currentDaypart: 'midnight', featuredRotationSeconds: 999,
    });
    const back = deserialize(raw)!;
    expect(back.preparing).toEqual([]);     // non-array -> []
    expect(back.ready).toEqual([]);
    expect(back.currentDaypart).toBe('all'); // invalid enum -> default
    expect(back.featuredRotationSeconds).toBe(8);
  });

  it('isRenderable requires a cached tvRow (so the screen can pick its layout offline)', () => {
    expect(isRenderable(null)).toBe(false);
    expect(isRenderable(deserialize(serialize(buildSnapshot(fullState()))))).toBe(true);
    const noRow = buildSnapshot({ ...fullState(), tvRow: null });
    expect(isRenderable(noRow)).toBe(false);
  });

  it('exposes a versioned cache key', () => {
    expect(CACHE_KEY).toMatch(/^tv_display_cache_v\d+$/);
  });
});
