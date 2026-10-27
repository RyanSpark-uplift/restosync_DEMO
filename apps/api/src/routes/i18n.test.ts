// i18n parity test — placed in apps/api because shared has no test infra.
// Ensures every key in EN has a corresponding translation in ES.

import { describe, it, expect } from 'vitest';
import { EN, ES, t } from '@restosync/shared/i18n';

describe('i18n parity', () => {
  it('ES has all EN keys', () => {
    const enKeys = Object.keys(EN).sort();
    const esKeys = Object.keys(ES).sort();
    const missing = enKeys.filter((k) => !esKeys.includes(k));
    expect(missing).toEqual([]);
  });

  it('ES has no extra keys not in EN', () => {
    const enKeys = new Set(Object.keys(EN));
    const extras = Object.keys(ES).filter((k) => !enKeys.has(k));
    expect(extras).toEqual([]);
  });

  it('t() falls back to EN when lang is es and key has empty string', () => {
    // 'order.priority.normal' is intentionally empty in both langs.
    expect(t('order.priority.normal', 'es')).toBe('');
    expect(t('order.priority.normal', 'en')).toBe('');
  });

  it('t() resolves {{var}} substitutions in EN', () => {
    expect(t('tts.ready_announce', 'en', { number: '23' }))
      .toBe('Order 23 is ready for pickup');
  });

  it('t() resolves {{var}} substitutions in ES', () => {
    expect(t('tts.ready_announce', 'es', { number: '23' }))
      .toBe('Orden 23 lista para recoger');
  });
});
