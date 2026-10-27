import { describe, it, expect } from 'vitest';
import { estimatePrepTime } from './aiPrepTime';

describe('estimatePrepTime', () => {
  const stored = {
    ai: {
      prep_time_lookup: { Americano: 2, Pasta: 12, Croissant: 4 },
      peak_multiplier: 1.5,
      range_buffer_minutes: 3,
    },
    timeout: { peak_start: '11:00', peak_end: '14:00' },
  };
  // Tests pin timezone to UTC so they're not server-tz-dependent.
  const tz = 'UTC';
  const earlyMorning = new Date('2026-05-14T03:00:00Z'); // 03:00 UTC — off-peak
  const noon         = new Date('2026-05-14T12:30:00Z'); // 12:30 UTC — inside 11:00-14:00 peak window

  it('returns 1 minute floor when items list is empty', () => {
    const r = estimatePrepTime({ items: [], storedConfig: stored, when: earlyMorning, timezone: tz });
    expect(r.estimated_minutes).toBeGreaterThanOrEqual(1);
  });

  it('uses longest item time as base (parallel cook)', () => {
    const r = estimatePrepTime({
      items: [{ name: 'Americano' }, { name: 'Pasta' }],
      storedConfig: stored,
      when: earlyMorning,
      timezone: tz,
    });
    // base = 12 (Pasta) + 1 (one extra item) = 13. Off-peak: no multiplier.
    expect(r.estimated_minutes).toBe(13);
    expect(r.applied_peak_multiplier).toBe(false);
    expect(r.range_min).toBe(10);
    expect(r.range_max).toBe(16);
  });

  it('multiplies by peak_multiplier during peak hours', () => {
    const r = estimatePrepTime({
      items: [{ name: 'Pasta' }],
      storedConfig: stored,
      when: noon,
      timezone: tz,
    });
    // base 12 * 1.5 = 18
    expect(r.estimated_minutes).toBe(18);
    expect(r.applied_peak_multiplier).toBe(true);
  });

  it('falls back to defaults when storedConfig is missing', () => {
    const r = estimatePrepTime({ items: [{ name: 'Unknown' }] });
    expect(r.estimated_minutes).toBeGreaterThanOrEqual(1);
  });
});
