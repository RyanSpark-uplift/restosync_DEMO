// Resolve storeSettings.theme into one of two render modes:
//
//   - "themed"  — the new 12-theme handoff (theme_key set to a known key).
//                 Caller renders with theme tokens + cardScale-driven typography.
//   - "legacy"  — pre-handoff stores. Caller renders the original emerald
//                 layout with optional primary_color/accent_color tinting.
//
// The split keeps both paths shippable: existing stores without a theme_key
// continue to see exactly what they saw before, while opted-in stores get the
// handoff-grade design without a feature flag toggle.

import {
  THEMES,
  THEME_DEFAULT_COLUMNS,
  resolveReadyTheme,
  cardScale,
  type CardScale,
  type Theme,
  type ThemeKey,
} from '@restosync/shared';

export type PickupThemeMode = 'themed' | 'legacy';

export interface ResolvedPickupTheme {
  mode: PickupThemeMode;
  // Populated only when mode === 'themed'.
  theme?: Theme;
  readyTheme?: Theme;
  columns?: number;
  scale?: CardScale;
  storeLabel?: string;
  pickupLabel?: string;
  // Populated only when mode === 'legacy' (kept here so the screen reads a
  // single resolver result instead of separately re-reading store settings).
  legacyPrimaryColor?: string;
  legacyAccentColor?: string;
  legacyCardStyle?: 'rounded' | 'square' | 'minimal' | 'glass';
}

interface ThemeConfigShape {
  theme_key?: string;
  columns?: number;
  storeLabel?: string;
  pickupLabel?: string;
  primary_color?: string;
  accent_color?: string;
  card_style?: 'rounded' | 'square' | 'minimal' | 'glass';
}

/**
 * Resolve a TV-effective theme config (already merged with per_tv overrides
 * via packages/shared/storeSettings.resolveTvSettings).
 */
export function resolvePickupTheme(themeBlob: unknown): ResolvedPickupTheme {
  if (!themeBlob || typeof themeBlob !== 'object') {
    return { mode: 'legacy' };
  }
  const cfg = themeBlob as ThemeConfigShape;
  const key = cfg.theme_key;
  if (key && key in THEMES) {
    const tk = key as ThemeKey;
    const theme = THEMES[tk];
    const columns = cfg.columns ?? THEME_DEFAULT_COLUMNS[tk];
    return {
      mode: 'themed',
      theme,
      readyTheme: resolveReadyTheme(theme),
      columns,
      scale: cardScale(columns),
      storeLabel: (cfg.storeLabel && cfg.storeLabel.trim()) || theme.storeLabel,
      pickupLabel: (cfg.pickupLabel && cfg.pickupLabel.trim()) || theme.pickupLabel,
    };
  }
  return {
    mode: 'legacy',
    legacyPrimaryColor: cfg.primary_color ?? '',
    legacyAccentColor:  cfg.accent_color  ?? '',
    legacyCardStyle:    cfg.card_style    ?? 'rounded',
  };
}
