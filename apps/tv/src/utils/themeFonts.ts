// Resolve a theme's fontDisplay / fontBody CSS stack + weight into an RN
// fontFamily string. The 12 themes in packages/shared/src/themes.ts express
// fonts as CSS stacks (e.g. "'Bebas Neue', 'Arial Narrow', sans-serif") that
// the HTML viewer applies directly. RN cannot consume a stack — it needs the
// exact registered font name. We map (family, weight) → the ttf base name that
// expo-font registers in src/hooks/useThemeFonts.ts.
//
// When the requested ttf is not registered (file not yet added to fontAssets.ts),
// we return undefined so the caller leaves fontFamily unset and RN falls back
// to the platform system font. The design handoff README forbids silent
// substitution into another Google font — system fallback is the explicit
// failure mode.

import type { Theme } from '@restosync/shared';
import { FONT_ASSETS } from './fontAssets';

// Family → available weights → registered ttf base name.
// Source of truth: apps/tv/assets/fonts/README.md table.
const FAMILY_WEIGHT_TO_NAME: Record<string, Record<number, string>> = {
  'Inter':              { 400: 'Inter-Regular', 500: 'Inter-Medium', 600: 'Inter-SemiBold', 700: 'Inter-Bold', 800: 'Inter-ExtraBold' },
  'Manrope':            { 500: 'Manrope-Medium', 600: 'Manrope-SemiBold', 700: 'Manrope-Bold' },
  'DM Serif Display':   { 400: 'DMSerifDisplay-Regular' },
  'Playfair Display':   { 700: 'PlayfairDisplay-Bold' },
  'Cormorant Garamond': { 500: 'CormorantGaramond-Medium' },
  'Bebas Neue':         { 400: 'BebasNeue-Regular' },
  'Space Grotesk':      { 600: 'SpaceGrotesk-SemiBold', 700: 'SpaceGrotesk-Bold' },
  'Fraunces':           { 600: 'Fraunces-SemiBold' },
  'Quicksand':          { 500: 'Quicksand-Medium', 600: 'Quicksand-SemiBold', 700: 'Quicksand-Bold' },
  'Lora':               { 600: 'Lora-SemiBold', 700: 'Lora-Bold' },
  'Cinzel':             { 600: 'Cinzel-SemiBold', 700: 'Cinzel-Bold' },
  'Familjen Grotesk':   { 700: 'FamiljenGrotesk-Bold' },
};

const PARSE_FIRST_FAMILY = /^['"]?([^'",]+)['"]?/;

function parseFirstFamily(cssStack: string): string {
  const m = PARSE_FIRST_FAMILY.exec(cssStack.trim());
  return m ? m[1].trim() : 'Inter';
}

function pickClosestWeight(weights: number[], target: number): number {
  return [...weights].sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0];
}

// Track families we've already warned about so console isn't spammed on every render.
const warnedKeys = new Set<string>();

/**
 * Resolve a CSS stack + weight into an RN-registered fontFamily name.
 * Returns undefined when the ttf is not yet bundled — caller must leave
 * fontFamily unset (system fallback) per design handoff "no silent substitution".
 */
export function resolveFontFamily(cssStack: string, weight: number): string | undefined {
  const family = parseFirstFamily(cssStack);
  const weights = FAMILY_WEIGHT_TO_NAME[family];
  if (!weights) {
    warnOnce(`themeFonts: family "${family}" not registered`);
    return undefined;
  }
  const wantWeight = weights[weight] ? weight : pickClosestWeight(Object.keys(weights).map(Number), weight);
  const baseName = weights[wantWeight];
  if (!baseName) return undefined;
  if (!(baseName in FONT_ASSETS)) {
    warnOnce(`themeFonts: ttf "${baseName}.ttf" missing — drop it into apps/tv/assets/fonts/ and uncomment in fontAssets.ts`);
    return undefined;
  }
  return baseName;
}

function warnOnce(key: string) {
  if (warnedKeys.has(key)) return;
  warnedKeys.add(key);
  // eslint-disable-next-line no-console
  console.warn(`[restosync/tv] ${key}`);
}

/**
 * Convenience: resolve display + body fonts for a single theme in one call.
 * Each returned name may be undefined if its ttf isn't bundled yet.
 */
export function resolveThemeFonts(theme: Pick<Theme, 'fontDisplay' | 'fontBody' | 'weightHead' | 'weightNumber'>) {
  return {
    displayHead:   resolveFontFamily(theme.fontDisplay, theme.weightHead),
    displayNumber: resolveFontFamily(theme.fontDisplay, theme.weightNumber),
    body:          resolveFontFamily(theme.fontBody, 500),
    bodyBold:      resolveFontFamily(theme.fontBody, 700),
  };
}
