// RestoSync design tokens — dark restaurant theme
// All values are `as const` so components get narrow literal types.

export const T = {
  color: {
    // ── Backgrounds ──────────────────────────────────────────────────────
    bg0: '#0B0D16',   // canvas / deepest
    bg1: '#0F1223',   // main app surface
    bg2: '#161929',   // card / panel
    bg3: '#1E2238',   // elevated input / sheet
    bg4: '#252A45',   // hover / pressed state

    // ── Borders ──────────────────────────────────────────────────────────
    border:  '#2A2E4A',
    borderS: '#1A1E33', // subtle

    // ── Text ─────────────────────────────────────────────────────────────
    t0: '#F0F2FF', // primary
    t1: '#8B90B0', // secondary
    t2: '#4E5375', // muted / disabled

    // ── Brand & Semantic ─────────────────────────────────────────────────
    brand:   '#FF4D00', // RestoSync spicy orange
    brandL:  '#FF6A25', // lighter variant
    success: '#22C55E',
    warn:    '#F59E0B',
    error:   '#EF4444',
    info:    '#6366F1',

    // ── Function-type badge colors ────────────────────────────────────────
    ftMenu:    '#6366F1', // indigo  — MENU TVs
    ftPickup:  '#A855F7', // purple  — PICKUP TVs
    ftEvent:   '#F59E0B', // amber   — EVENT TVs
    ftAd:      '#10B981', // emerald — AD TVs

    // ── Status ───────────────────────────────────────────────────────────
    online:  '#22C55E',
    offline: '#4E5375',

    // ── Order status ─────────────────────────────────────────────────────
    sNew:       '#6366F1',
    sPrep:      '#F59E0B',
    sReady:     '#22C55E',
    sCollected: '#4E5375',
    sCancelled: '#EF4444',
  },

  // ── Spacing (4-pt grid) ──────────────────────────────────────────────────
  sp: {
    1:  4,
    2:  8,
    3:  12,
    4:  16,
    5:  20,
    6:  24,
    8:  32,
    10: 40,
    12: 48,
    16: 64,
  },

  // ── Border radius ────────────────────────────────────────────────────────
  r: {
    xs:   4,
    sm:   8,
    md:   12,
    lg:   18,
    xl:   24,
    full: 999,
  },

  // ── Font sizes ───────────────────────────────────────────────────────────
  fs: {
    xs:  11,
    sm:  13,
    md:  15,
    lg:  17,
    xl:  20,
    '2xl': 24,
    '3xl': 30,
    '4xl': 38,
  },

  // ── Font weights ─────────────────────────────────────────────────────────
  fw: {
    regular:  '400' as const,
    medium:   '500' as const,
    semibold: '600' as const,
    bold:     '700' as const,
  },

  // ── Shadows (elevation) ──────────────────────────────────────────────────
  shadow: {
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.3,
      shadowRadius: 3,
      elevation: 2,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 8,
      elevation: 6,
    },
  },
} as const;

export type Tokens = typeof T;

// Utility: function type → badge color
export const ftColor = (ft: string): string => {
  const map: Record<string, string> = {
    menu:    T.color.ftMenu,
    pickup:  T.color.ftPickup,
    event:   T.color.ftEvent,
    ad:      T.color.ftAd,
  };
  return map[ft] ?? T.color.t2;
};

// Utility: order status → color
export const statusColor = (s: string): string => {
  const map: Record<string, string> = {
    new:       T.color.sNew,
    prep:      T.color.sPrep,
    ready:     T.color.sReady,
    collected: T.color.sCollected,
    cancelled: T.color.sCancelled,
  };
  return map[s] ?? T.color.t2;
};
