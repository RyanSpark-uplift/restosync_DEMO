import { describe, it, expect } from 'vitest';
import { __test__ } from './scheduler';
import { defaultStoreSettings } from '@restosync/shared/storeSettings';

const { currentDaypart, localHHmm, deepMerge } = __test__;

describe('scheduler helpers', () => {
  describe('currentDaypart', () => {
    const settings = defaultStoreSettings();
    const tz = 'America/Los_Angeles';

    it('returns breakfast for 08:00 LA', () => {
      const d = new Date('2026-05-14T15:00:00Z'); // 08:00 PDT
      expect(currentDaypart(settings, tz, d)).toBe('breakfast');
    });

    it('returns lunch for 12:30 LA', () => {
      const d = new Date('2026-05-14T19:30:00Z'); // 12:30 PDT
      expect(currentDaypart(settings, tz, d)).toBe('lunch');
    });

    it('returns dinner for 19:00 LA', () => {
      const d = new Date('2026-05-15T02:00:00Z'); // 19:00 PDT day before
      expect(currentDaypart(settings, tz, d)).toBe('dinner');
    });

    it('returns all for 03:00 LA (outside windows)', () => {
      const d = new Date('2026-05-14T10:00:00Z'); // 03:00 PDT
      expect(currentDaypart(settings, tz, d)).toBe('all');
    });
  });

  describe('localHHmm', () => {
    it('formats HH:mm in a tz', () => {
      const d = new Date('2026-05-14T15:00:00Z');
      expect(localHHmm('America/Los_Angeles', d)).toBe('08:00');
    });
  });

  describe('deepMerge', () => {
    it('overrides scalars, recurses into objects, preserves arrays', () => {
      const base = { a: 1, b: { c: 2, d: 3 }, arr: [1, 2] };
      const patch = { b: { d: 99 }, arr: [9] };
      const merged = deepMerge(base, patch as never);
      expect(merged).toEqual({ a: 1, b: { c: 2, d: 99 }, arr: [9] });
    });
  });
});
