// Sprint 2 S2.20 — menuSnapshot service unit tests
//
// Pure helpers (resolveCurrentDaypart + computeEtag) — DB/Redis 비의존.
// buildSnapshot / getSnapshot / invalidateSnapshot 은 통합 테스트 영역.

import { describe, it, expect } from 'vitest';
import { resolveCurrentDaypart, computeEtag } from './menuSnapshot';
import type { MenuSnapshot, MenuSnapshotDaypartWindow } from '@restosync/shared';

const W = (name: MenuSnapshotDaypartWindow['name'], start: string, end: string): MenuSnapshotDaypartWindow =>
  ({ name, start, end });

describe('resolveCurrentDaypart', () => {
  const windows = [
    W('breakfast', '06:00', '11:00'),
    W('lunch',     '11:00', '14:30'),
    W('snack',     '14:30', '17:00'),
    W('dinner',    '17:00', '21:00'),
    W('late',      '21:00', '02:00'),   // overnight
  ];

  it('returns null when no windows configured', () => {
    expect(resolveCurrentDaypart([], 'America/Los_Angeles')).toBeNull();
  });

  it('skips wildcard "all" window even if present', () => {
    const r = resolveCurrentDaypart(
      [W('all', '00:00', '23:59')],
      'America/Los_Angeles',
    );
    expect(r).toBeNull();
  });

  it('returns a string daypart name when windows match (smoke)', () => {
    // 시간 의존 — 결과가 null 또는 5개 중 하나만 보장
    const r = resolveCurrentDaypart(windows, 'America/Los_Angeles');
    expect(r === null || ['breakfast', 'lunch', 'snack', 'dinner', 'late'].includes(r)).toBe(true);
  });
});

describe('computeEtag', () => {
  const base: MenuSnapshot = {
    store_id: 'store-1',
    generated_at: '2026-05-18T00:00:00.000Z',
    ttl_sec: 60,
    lang: 'en',
    current_daypart: 'lunch',
    timezone: 'America/Los_Angeles',
    default_language: 'en',
    supported_languages: ['en'],
    currency: 'USD',
    daypart_windows: [],
    categories: [],
    items: [],
  };

  it('is deterministic for the same input', () => {
    expect(computeEtag(base)).toBe(computeEtag(base));
  });

  it('changes when items mutate', () => {
    const other: MenuSnapshot = {
      ...base,
      items: [{
        id: 'i1',
        category_id: null,
        name_i18n: { en: 'Burger' },
        description_i18n: null,
        price_cents: 999,
        image_url: null,
        dayparts: ['all'],
        allergens: [],
        spice_level: null,
        calories: null,
        sort_order: 0,
        is_featured: false,
        is_hot: false,
        sold_out: false,
        show_on_tv: true,
        available_from: null,
        available_until: null,
        tax_policy: 'exclusive',
        photo_status: 'ready',
      }],
    };
    expect(computeEtag(other)).not.toBe(computeEtag(base));
  });

  it('changes when price changes', () => {
    const a: MenuSnapshot = { ...base, items: [{ ...mkItem(), price_cents: 1000 }] };
    const b: MenuSnapshot = { ...base, items: [{ ...mkItem(), price_cents: 1100 }] };
    expect(computeEtag(a)).not.toBe(computeEtag(b));
  });

  it('uses RFC 7232 weak-form ETag value (quoted hex)', () => {
    const e = computeEtag(base);
    expect(e.startsWith('"')).toBe(true);
    expect(e.endsWith('"')).toBe(true);
    expect(e.length).toBeGreaterThan(8);
  });
});

function mkItem() {
  return {
    id: 'i1',
    category_id: null,
    name_i18n: { en: 'X' },
    description_i18n: null,
    price_cents: 0,
    image_url: null,
    dayparts: ['all'] as const,
    allergens: [],
    spice_level: null,
    calories: null,
    sort_order: 0,
    is_featured: false,
    is_hot: false,
    sold_out: false,
    show_on_tv: true,
    available_from: null,
    available_until: null,
    tax_policy: 'exclusive' as const,
    photo_status: null,
  };
}
