// Sprint 1 S1.8 — Zod schemas vitest
import { describe, it, expect } from 'vitest';
import {
  MenuItemCreateSchema,
  MenuItemUpdateSchema,
  ToggleSoldOutSchema,
  MenuItemListQuerySchema,
  CategoryCreateSchema,
  CategoryReorderSchema,
  DaypartUpdateSchema,
} from './menu';

describe('MenuItemCreate', () => {
  const valid = {
    name_i18n: { en: 'demo-store-a', ko: '크리스피 치킨' },
    price_cents: 999,
  };

  it('accepts minimal valid input', () => {
    const r = MenuItemCreateSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.dayparts_arr).toEqual(['all']);
      expect(r.data.tax_policy).toBe('exclusive');
      expect(r.data.show_on_tv).toBe(true);
    }
  });

  it('rejects float price (BR-01 — must be integer cents)', () => {
    const r = MenuItemCreateSchema.safeParse({ ...valid, price_cents: 9.99 });
    expect(r.success).toBe(false);
  });

  it('rejects negative price', () => {
    const r = MenuItemCreateSchema.safeParse({ ...valid, price_cents: -1 });
    expect(r.success).toBe(false);
  });

  it('rejects daypart variant ("morning" not in enum)', () => {
    const r = MenuItemCreateSchema.safeParse({ ...valid, dayparts_arr: ['morning'] });
    expect(r.success).toBe(false);
  });

  it('accepts new 6-value dayparts (snack, late)', () => {
    const r = MenuItemCreateSchema.safeParse({ ...valid, dayparts_arr: ['snack', 'late'] });
    expect(r.success).toBe(true);
  });

  it('requires name_i18n.en (BR-11 fallback)', () => {
    const r = MenuItemCreateSchema.safeParse({ ...valid, name_i18n: { ko: 'X' } });
    expect(r.success).toBe(false);
  });

  it('rejects FDA-9 invalid allergen', () => {
    const r = MenuItemCreateSchema.safeParse({ ...valid, allergens: ['cheese'] });
    expect(r.success).toBe(false);
  });
});

describe('ToggleSoldOut', () => {
  it('accepts boolean + optional reason', () => {
    expect(ToggleSoldOutSchema.safeParse({ sold_out: true }).success).toBe(true);
    expect(ToggleSoldOutSchema.safeParse({ sold_out: false, reason: 'out of stock' }).success).toBe(true);
  });
  it('rejects missing sold_out', () => {
    expect(ToggleSoldOutSchema.safeParse({}).success).toBe(false);
  });
});

describe('MenuItemListQuery (AG-021)', () => {
  it('coerces limit string to int and caps at 500', () => {
    const r = MenuItemListQuerySchema.safeParse({ limit: '100' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.limit).toBe(100);

    const r2 = MenuItemListQuerySchema.safeParse({ limit: '999' });
    expect(r2.success).toBe(false);
  });

  it('default limit = 100 (AG-021 max safety)', () => {
    const r = MenuItemListQuerySchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.limit).toBe(100);
  });
});

describe('CategoryReorder', () => {
  it('accepts batch reorder', () => {
    const r = CategoryReorderSchema.safeParse({
      orders: [
        { id: '00000000-0000-0000-0000-000000000001', sort_order: 0 },
        { id: '00000000-0000-0000-0000-000000000002', sort_order: 1 },
      ],
    });
    expect(r.success).toBe(true);
  });
  it('rejects empty batch', () => {
    expect(CategoryReorderSchema.safeParse({ orders: [] }).success).toBe(false);
  });
});

describe('DaypartUpdate overlap detection', () => {
  it('accepts non-overlapping 6 windows including overnight late', () => {
    const r = DaypartUpdateSchema.safeParse({
      windows: {
        breakfast: { start: '06:00', end: '11:00' },
        lunch:     { start: '11:00', end: '14:30' },
        snack:     { start: '14:30', end: '17:00' },
        dinner:    { start: '17:00', end: '21:00' },
        late:      { start: '21:00', end: '02:00' },  // overnight
      },
    });
    expect(r.success).toBe(true);
  });

  it('rejects overlapping windows (lunch ⊃ snack)', () => {
    const r = DaypartUpdateSchema.safeParse({
      windows: {
        breakfast: { start: '06:00', end: '11:00' },
        lunch:     { start: '11:00', end: '15:00' },   // ← extends into snack
        snack:     { start: '14:30', end: '17:00' },   // overlap 14:30~15:00
      },
    });
    expect(r.success).toBe(false);
  });

  it('rejects invalid HH:MM format', () => {
    const r = DaypartUpdateSchema.safeParse({
      windows: { breakfast: { start: '6:00', end: '11:0' } },
    });
    expect(r.success).toBe(false);  // '11:0' is invalid
  });
});

describe('CategoryCreate', () => {
  it('accepts i18n + emoji', () => {
    expect(CategoryCreateSchema.safeParse({
      name: { en: 'Chicken', ko: '치킨' },
      icon: '🍗',
    }).success).toBe(true);
  });
});

describe('MenuItemUpdate', () => {
  it('partial — only price_cents allowed', () => {
    const r = MenuItemUpdateSchema.safeParse({ price_cents: 1299 });
    expect(r.success).toBe(true);
  });
  it('still validates field constraints when present', () => {
    const r = MenuItemUpdateSchema.safeParse({ price_cents: -1 });
    expect(r.success).toBe(false);
  });
});
