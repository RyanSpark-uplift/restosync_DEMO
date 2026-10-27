// Sprint F.A — computeCurrentDaypart unit tests (DB-free)
// AG-024 stores.timezone 기준 daypart 계산 / DAYPART 6-value 정본 / 'late' overnight 지원

import { describe, it, expect } from 'vitest';
import { computeCurrentDaypart } from './menuFeatured';

const LA = 'America/Los_Angeles';

// Build a Date that, when converted to LA tz, yields the given local 'HH:mm' on 2026-05-20.
// 2026-05-20 is PDT (UTC-7). LA local 09:00 → UTC 16:00.
function laLocal(hh: number, mm = 0): Date {
  return new Date(Date.UTC(2026, 4, 20, hh + 7, mm));   // month 4 = May (0-indexed)
}

const FULL_WINDOWS = {
  breakfast: { start: '06:00', end: '11:00' },
  lunch:     { start: '11:00', end: '14:30' },
  snack:     { start: '14:30', end: '17:00' },
  dinner:    { start: '17:00', end: '21:00' },
  late:      { start: '21:00', end: '02:00' },         // overnight
};

describe('computeCurrentDaypart', () => {
  it('returns null when windows undefined', () => {
    expect(computeCurrentDaypart(new Date(), LA, undefined)).toBeNull();
  });

  it('returns null when windows empty', () => {
    expect(computeCurrentDaypart(new Date(), LA, {})).toBeNull();
  });

  it('matches breakfast at 06:30 LA', () => {
    expect(computeCurrentDaypart(laLocal(6, 30), LA, FULL_WINDOWS)).toBe('breakfast');
  });

  it('matches lunch at 12:00 LA', () => {
    expect(computeCurrentDaypart(laLocal(12), LA, FULL_WINDOWS)).toBe('lunch');
  });

  it('matches snack at 15:00 LA', () => {
    expect(computeCurrentDaypart(laLocal(15), LA, FULL_WINDOWS)).toBe('snack');
  });

  it('matches dinner at 18:00 LA', () => {
    expect(computeCurrentDaypart(laLocal(18), LA, FULL_WINDOWS)).toBe('dinner');
  });

  it('matches late (overnight) at 22:00 LA', () => {
    expect(computeCurrentDaypart(laLocal(22), LA, FULL_WINDOWS)).toBe('late');
  });

  it('matches late (overnight) at 01:30 LA', () => {
    expect(computeCurrentDaypart(laLocal(1, 30), LA, FULL_WINDOWS)).toBe('late');
  });

  it('returns null in gap (e.g., 05:00 with no breakfast match)', () => {
    expect(computeCurrentDaypart(laLocal(5), LA, FULL_WINDOWS)).toBeNull();
  });

  it('skips "all" wildcard (data-only, no time match)', () => {
    const w = { ...FULL_WINDOWS, all: { start: '00:00', end: '23:59' } };
    // 12:00 should still resolve to lunch, not 'all'
    expect(computeCurrentDaypart(laLocal(12), LA, w)).toBe('lunch');
  });

  it('rejects unknown daypart name (AG-013 enum drift)', () => {
    const w = { morning: { start: '06:00', end: '11:00' } };  // 'morning' not in DAYPART
    expect(computeCurrentDaypart(laLocal(7), LA, w)).toBeNull();
  });
});
