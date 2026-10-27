// Helpers shared between the HTML TV viewer (apps/api/public/tv-view.html) and
// the RN TV app (apps/tv). Keep this file framework-free so the HTML can
// transpile-and-inline it via a small build step or duplicate the relevant
// snippet — the logic is the same on both sides.

import type { SourceKey, Theme } from './themes';

// Perceived luminance (Rec. 601 weights). Returns 0–255. Used to auto-pick
// readable text colors on a card bg without hard-coding per-theme.
export function hexLum(hex: string): number {
  if (!hex || hex[0] !== '#') return 128;
  const c = hex.length === 4
    ? hex.slice(1).split('').map((x) => x + x).join('')
    : hex.slice(1);
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return r * 0.299 + g * 0.587 + b * 0.114;
}

export function isLightHex(hex: string): boolean {
  return hexLum(hex) > 160;
}

// Resolve a theme for ready-side rendering: spread readyOverrides on top of
// the base theme. Surgical — only listed keys change; fonts/radii/src palette/
// icon/accents stay shared. Mirrors `{ ...themeIn, ...themeIn.readyOverrides }`
// in the design handoff pickup-board.jsx.
export function resolveReadyTheme(theme: Theme): Theme {
  return theme.readyOverrides ? { ...theme, ...theme.readyOverrides } : theme;
}

// Map our DB orderSource enum to the design's SourceKey union. The handoff
// supports 8 channels; our DB enum (packages/shared/enums.ts) matches 1:1
// after upper-casing.
export function normalizeSource(dbSource: string): SourceKey {
  const s = (dbSource || '').toLowerCase();
  switch (s) {
    case 'pos':         return 'POS';
    case 'kiosk':       return 'KIOSK';
    case 'manual':      return 'MANUAL';
    case 'doordash':    return 'DOORDASH';
    case 'ubereats':    return 'UBEREATS';
    case 'grubhub':     return 'GRUBHUB';
    case 'fantuan':     return 'FANTUAN';
    case 'hungrypanda': return 'HUNGRYPANDA';
    default:            return 'MANUAL';
  }
}

// Card-size scale by column count. Mirrors the per-row table in README.md.
// `big = columns <= 2` is the same shorthand used throughout the design.
export interface CardScale {
  big: boolean;
  med: boolean;
  numSize: number;
  padY: number;
  padX: number;
  gap: number;
  minHeight: number;
  sectionTitleSize: number;
  sectionGap: number;
  sidePadY: number;
  sidePadX: number;
  gridGap: number;
}

export function cardScale(columns: number): CardScale {
  const big   = columns <= 2;
  const med   = columns === 3;
  const dense = columns >= 5;
  return {
    big,
    med,
    numSize:          big ? 96 : med ? 68 : dense ? 40 : 52,
    padY:             big ? 22 : med ? 18 : dense ? 10 : 14,
    padX:             big ? 28 : med ? 22 : dense ? 12 : 18,
    gap:              big ? 14 : med ? 10 : dense ?  6 :  8,
    minHeight:        big ? 200 : med ? 150 : dense ? 88 : 110,
    sectionTitleSize: big ? 30 : dense ? 22 : 22,
    sectionGap:       big ? 22 : dense ? 14 : 16,
    sidePadY:         big ? 34 : dense ? 22 : 26,
    sidePadX:         big ? 36 : dense ? 22 : 28,
    gridGap:          big ? 16 : dense ? 10 : 12,
  };
}
