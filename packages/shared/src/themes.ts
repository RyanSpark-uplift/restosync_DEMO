// Themes & sample data for the Order Pickup TV display.
// Single source of truth shared by apps/api/public/tv-view.html and apps/tv.
//
// Hand-off origin: DevGuide/Theme/extracted/design_handoff_order_pickup/themes.jsx.
// Each theme = visual style only. storeLabel / pickupLabel here are SUGGESTED
// placeholder copy for the theme-picker preview — real labels come from store
// settings (StoreSettings.theme.storeLabel / pickupLabel) and override these at
// render time. Any restaurant can pair any theme with any label.
//
// SourceKey extended from the original 4 to 8 to cover all delivery channels
// in our DB enum (packages/shared/enums.ts). The extra 4 (UBEREATS / GRUBHUB /
// FANTUAN / HUNGRYPANDA) use muted, tonally-coherent colors per theme so they
// stay readable without dominating the legacy POS / MANUAL / KIOSK / DOORDASH
// palette.

export type SourceKey =
  | 'POS' | 'MANUAL' | 'KIOSK' | 'DOORDASH'
  | 'UBEREATS' | 'GRUBHUB' | 'FANTUAN' | 'HUNGRYPANDA';

export type ReadyIcon = 'check' | 'bell' | 'leaf' | 'arrow' | 'square' | 'dot';

export type ThemeKey =
  | 'bistro' | 'cafe' | 'steakhouse' | 'sushi' | 'burger' | 'sage'
  | 'neon' | 'riviera' | 'boba' | 'lodge' | 'speakeasy' | 'diner';

export interface Theme {
  // Identity / copy
  name: string;
  desc: string;
  storeLabel: string;
  pickupLabel: string;

  // Type
  fontBody: string;
  fontDisplay: string;
  weightNumber: number;
  weightHead: number;

  // Shape
  radius: number;
  minimal?: boolean;
  pill?: boolean;
  underline?: boolean;
  cardOnCard?: boolean;

  // Surfaces
  bg: string;
  bgReady: string;
  cardPrep: string;
  cardReady: string;
  cardBorder: string;
  cardBorderReady: string;

  // Text
  text: string;
  textDim: string;
  textCard?: string;
  textCardDim?: string;
  textNum: string;
  textNumReady?: string;

  // Accents
  headTeal: string;
  accentReady: string;
  activeColor: string;
  statusFg: string;

  // Top-bar chip
  storeChipBg: string;
  storeChipFg: string;

  // Source palette + foreground (8 channels)
  src:   Record<SourceKey, string>;
  srcFg: Record<SourceKey, string>;

  // Employee chip
  empChipBg: string;
  empChipFg: string;

  // Ready-icon style
  readyIcon: ReadyIcon;

  // Per-side overrides — spread over base theme when rendering ready cards / header.
  readyOverrides?: Partial<Theme>;
}

// ─── 12 Themes ─────────────────────────────────────────────────────────
export const THEMES: Record<ThemeKey, Theme> = {

  bistro: {
    name: 'Modern Bistro',
    desc: 'Dark + emerald · Inter. Closest to the original.',
    storeLabel: 'KITCHEN',
    pickupLabel: 'ORDER PICKUP',
    fontBody: "'Inter', system-ui, sans-serif",
    fontDisplay: "'Inter', system-ui, sans-serif",
    weightNumber: 800,
    weightHead:   800,
    radius: 10,
    bg:          '#0b1514',
    bgReady:     '#0c3026',
    cardPrep:    '#0e1a18',
    cardReady:   '#13362c',
    cardBorder:  'rgba(255,255,255,0.04)',
    cardBorderReady: 'rgba(79,184,158,0.18)',
    text:        '#e9f3f1',
    textDim:     'rgba(233,243,241,0.55)',
    textNum:     '#ffffff',
    headTeal:    '#4FB89E',
    accentReady: '#4FB89E',
    activeColor: '#4FB89E',
    storeChipBg: '#5b34d4',
    storeChipFg: '#ffffff',
    src: {
      POS:'#3b82f6', MANUAL:'#f97316', KIOSK:'#a78bfa', DOORDASH:'#ec4899',
      UBEREATS:'#5a8a5a', GRUBHUB:'#b87355', FANTUAN:'#9a4a4a', HUNGRYPANDA:'#b8782a',
    },
    srcFg: {
      POS:'#fff', MANUAL:'#fff', KIOSK:'#fff', DOORDASH:'#fff',
      UBEREATS:'#fff', GRUBHUB:'#fff', FANTUAN:'#fff', HUNGRYPANDA:'#fff',
    },
    empChipBg: 'rgba(255,255,255,0.06)',
    empChipFg: 'rgba(255,255,255,0.7)',
    statusFg:  '#facc15',
    readyIcon: 'check',
  },

  cafe: {
    name: 'Warm Cafe',
    desc: 'Cream + terracotta · DM Serif Display headlines.',
    storeLabel: 'BAR',
    pickupLabel: 'ready when called',
    fontBody: "'Inter', system-ui, sans-serif",
    fontDisplay: "'DM Serif Display', 'Times New Roman', serif",
    weightNumber: 400,
    weightHead:   400,
    radius: 6,
    bg:          '#f3ece1',
    bgReady:     '#e8dfd0',
    cardPrep:    '#ffffff',
    cardReady:   '#c1644a',
    cardBorder:  'rgba(90,55,30,0.08)',
    cardBorderReady: 'transparent',
    text:        '#3a261b',
    textDim:     'rgba(58,38,27,0.55)',
    textNum:     '#3a261b',
    textNumReady: '#fff8ee',
    headTeal:    '#c1644a',
    accentReady: '#c1644a',
    activeColor: '#c1644a',
    storeChipBg: '#3a261b',
    storeChipFg: '#f3ece1',
    src: {
      POS:'#3a261b', MANUAL:'#c1644a', KIOSK:'#7a6248', DOORDASH:'#9a4434',
      UBEREATS:'#7a8a4a', GRUBHUB:'#b8634a', FANTUAN:'#8a4a3a', HUNGRYPANDA:'#a06a3a',
    },
    srcFg: {
      POS:'#fff8ee', MANUAL:'#fff8ee', KIOSK:'#fff8ee', DOORDASH:'#fff8ee',
      UBEREATS:'#fff8ee', GRUBHUB:'#fff8ee', FANTUAN:'#fff8ee', HUNGRYPANDA:'#fff8ee',
    },
    empChipBg: 'rgba(58,38,27,0.07)',
    empChipFg: 'rgba(58,38,27,0.75)',
    statusFg:  '#9a6a2a',
    readyIcon: 'bell',
  },

  steakhouse: {
    name: 'Chophouse',
    desc: 'Carbon + brushed gold · Playfair Display. Upscale.',
    storeLabel: 'PASS',
    pickupLabel: 'GUEST PICKUP',
    fontBody: "'Inter', system-ui, sans-serif",
    fontDisplay: "'Playfair Display', 'Times New Roman', serif",
    weightNumber: 700,
    weightHead:   700,
    radius: 2,
    bg:          '#0d0c0a',
    bgReady:     '#15130e',
    cardPrep:    '#15130f',
    cardReady:   '#1c1810',
    cardBorder:  'rgba(214,176,99,0.12)',
    cardBorderReady: 'rgba(214,176,99,0.45)',
    text:        '#e8e1d2',
    textDim:     'rgba(232,225,210,0.5)',
    textNum:     '#f2e6c8',
    headTeal:    '#d6b063',
    accentReady: '#d6b063',
    activeColor: '#d6b063',
    storeChipBg: '#d6b063',
    storeChipFg: '#0d0c0a',
    src: {
      POS:'#3a4a52', MANUAL:'#7a5a2a', KIOSK:'#4a3a5a', DOORDASH:'#6a3a2a',
      UBEREATS:'#4a5a3a', GRUBHUB:'#8a4a3a', FANTUAN:'#6a3a3a', HUNGRYPANDA:'#7a6a3a',
    },
    srcFg: {
      POS:'#e8e1d2', MANUAL:'#f2e6c8', KIOSK:'#e8e1d2', DOORDASH:'#f2e6c8',
      UBEREATS:'#e8e1d2', GRUBHUB:'#f2e6c8', FANTUAN:'#f2e6c8', HUNGRYPANDA:'#f2e6c8',
    },
    empChipBg: 'rgba(214,176,99,0.08)',
    empChipFg: 'rgba(214,176,99,0.8)',
    statusFg:  '#d6b063',
    readyIcon: 'dot',
    underline: true,
  },

  sushi: {
    name: 'Sushi Bar',
    desc: 'Washi + sumi + indigo · Cormorant Garamond. Minimal.',
    storeLabel: '寿司',
    pickupLabel: 'PICKUP / お持ち帰り',
    fontBody: "'Inter', system-ui, sans-serif",
    fontDisplay: "'Cormorant Garamond', 'Times New Roman', serif",
    weightNumber: 500,
    weightHead:   500,
    radius: 0,
    bg:          '#f2ede3',
    bgReady:     '#1a1d2e',
    cardPrep:    '#fbf7ee',
    cardReady:   '#23283d',
    cardBorder:  'rgba(20,20,30,0.08)',
    cardBorderReady: 'rgba(180,150,90,0.25)',
    text:        '#1a1d2e',
    textDim:     'rgba(26,29,46,0.55)',
    textNum:     '#1a1d2e',
    textNumReady: '#f2ede3',
    headTeal:    '#1a1d2e',
    accentReady: '#c8a45c',
    activeColor: '#c1392b',
    storeChipBg: '#c1392b',
    storeChipFg: '#fbf7ee',
    src: {
      POS:'#1a1d2e', MANUAL:'#a06a3c', KIOSK:'#3a4f3a', DOORDASH:'#c1392b',
      UBEREATS:'#5a7a4a', GRUBHUB:'#a04a3a', FANTUAN:'#8a2a2a', HUNGRYPANDA:'#b8773a',
    },
    srcFg: {
      POS:'#fbf7ee', MANUAL:'#fbf7ee', KIOSK:'#fbf7ee', DOORDASH:'#fbf7ee',
      UBEREATS:'#fbf7ee', GRUBHUB:'#fbf7ee', FANTUAN:'#fbf7ee', HUNGRYPANDA:'#fbf7ee',
    },
    empChipBg: 'rgba(26,29,46,0.06)',
    empChipFg: 'rgba(26,29,46,0.7)',
    statusFg:  '#a06a3c',
    readyIcon: 'square',
    minimal: true,
    readyOverrides: {
      text:        '#f2ede3',
      textDim:     'rgba(242,237,227,0.75)',
      textCard:    '#f2ede3',
      textCardDim: 'rgba(242,237,227,0.75)',
      empChipBg:   'rgba(242,237,227,0.18)',
      empChipFg:   'rgba(242,237,227,0.95)',
    },
  },

  burger: {
    name: 'Burger Joint',
    desc: 'Crimson + cream · Bebas Neue. Energetic, drive-thru.',
    storeLabel: 'PICKUP',
    pickupLabel: 'GRAB & GO',
    fontBody: "'Inter', system-ui, sans-serif",
    fontDisplay: "'Bebas Neue', 'Arial Narrow', sans-serif",
    weightNumber: 400,
    weightHead:   400,
    radius: 4,
    bg:          '#1a0d0d',
    bgReady:     '#c8261f',
    cardPrep:    '#fff5e6',
    cardReady:   '#fff5e6',
    cardBorder:  'transparent',
    cardBorderReady: 'rgba(0,0,0,0.15)',
    text:        '#fff5e6',
    textDim:     'rgba(255,245,230,0.6)',
    textCard:    '#1a0d0d',
    textCardDim: 'rgba(26,13,13,0.6)',
    textNum:     '#c8261f',
    textNumReady: '#1a0d0d',
    headTeal:    '#ffcc33',
    accentReady: '#ffcc33',
    activeColor: '#ffcc33',
    storeChipBg: '#ffcc33',
    storeChipFg: '#1a0d0d',
    src: {
      POS:'#1a0d0d', MANUAL:'#c8261f', KIOSK:'#5a3a8a', DOORDASH:'#e85a3c',
      UBEREATS:'#5a6a3a', GRUBHUB:'#a8453a', FANTUAN:'#8a3a3a', HUNGRYPANDA:'#c8783a',
    },
    srcFg: {
      POS:'#ffcc33', MANUAL:'#fff5e6', KIOSK:'#fff5e6', DOORDASH:'#fff5e6',
      UBEREATS:'#fff5e6', GRUBHUB:'#fff5e6', FANTUAN:'#fff5e6', HUNGRYPANDA:'#fff5e6',
    },
    empChipBg: 'rgba(26,13,13,0.08)',
    empChipFg: 'rgba(26,13,13,0.75)',
    statusFg:  '#c8261f',
    readyIcon: 'arrow',
    cardOnCard: true,
  },

  sage: {
    name: 'Fresh & Green',
    desc: 'Sage + bone · Manrope. Calm, healthy, juice-bar.',
    storeLabel: 'COUNTER',
    pickupLabel: 'Order pickup',
    fontBody: "'Manrope', system-ui, sans-serif",
    fontDisplay: "'Manrope', system-ui, sans-serif",
    weightNumber: 700,
    weightHead:   700,
    radius: 28,
    bg:          '#eef2e6',
    bgReady:     '#dde7d0',
    cardPrep:    '#ffffff',
    cardReady:   '#5a7a4a',
    cardBorder:  'rgba(40,60,30,0.06)',
    cardBorderReady: 'transparent',
    text:        '#2a3a22',
    textDim:     'rgba(42,58,34,0.55)',
    textNum:     '#2a3a22',
    textNumReady: '#f4f8ec',
    headTeal:    '#5a7a4a',
    accentReady: '#5a7a4a',
    activeColor: '#5a7a4a',
    storeChipBg: '#2a3a22',
    storeChipFg: '#eef2e6',
    src: {
      POS:'#3a5a7a', MANUAL:'#c8884a', KIOSK:'#8a6ab4', DOORDASH:'#c45a6a',
      UBEREATS:'#6a8a5a', GRUBHUB:'#b87060', FANTUAN:'#a05050', HUNGRYPANDA:'#b8895a',
    },
    srcFg: {
      POS:'#fff', MANUAL:'#fff', KIOSK:'#fff', DOORDASH:'#fff',
      UBEREATS:'#fff', GRUBHUB:'#fff', FANTUAN:'#fff', HUNGRYPANDA:'#fff',
    },
    empChipBg: 'rgba(42,58,34,0.06)',
    empChipFg: 'rgba(42,58,34,0.75)',
    statusFg:  '#7a6a2a',
    readyIcon: 'leaf',
    pill: true,
  },

  neon: {
    name: 'Neon · Late Night',
    desc: 'Charcoal + magenta + cyan · Space Grotesk. Cocktail bar, ramen.',
    storeLabel: 'BAR',
    pickupLabel: 'NIGHT ORDERS',
    fontBody: "'Inter', system-ui, sans-serif",
    fontDisplay: "'Space Grotesk', system-ui, sans-serif",
    weightNumber: 700,
    weightHead:   600,
    radius: 4,
    bg:          '#0a0814',
    bgReady:     '#160a1f',
    cardPrep:    '#13101e',
    cardReady:   '#1d1429',
    cardBorder:  'rgba(255,255,255,0.05)',
    cardBorderReady: 'rgba(247,73,166,0.45)',
    text:        '#f0e8ff',
    textDim:     'rgba(240,232,255,0.5)',
    textNum:     '#f7e8ff',
    textNumReady:'#ff5fbe',
    headTeal:    '#ff5fbe',
    accentReady: '#ff5fbe',
    activeColor: '#5ee3ff',
    storeChipBg: '#ff5fbe',
    storeChipFg: '#0a0814',
    src: {
      POS:'#5ee3ff', MANUAL:'#ffaa3c', KIOSK:'#c46aff', DOORDASH:'#ff5fbe',
      UBEREATS:'#7adba0', GRUBHUB:'#ff8a6a', FANTUAN:'#ff6a8a', HUNGRYPANDA:'#ffb86a',
    },
    srcFg: {
      POS:'#0a0814', MANUAL:'#0a0814', KIOSK:'#0a0814', DOORDASH:'#0a0814',
      UBEREATS:'#0a0814', GRUBHUB:'#0a0814', FANTUAN:'#0a0814', HUNGRYPANDA:'#0a0814',
    },
    empChipBg: 'rgba(255,255,255,0.06)',
    empChipFg: 'rgba(255,255,255,0.7)',
    statusFg:  '#ffaa3c',
    readyIcon: 'dot',
  },

  riviera: {
    name: 'Coastal',
    desc: 'Sky + sand + coral · Fraunces. Seafood, beach, brunch.',
    storeLabel: 'COAST',
    pickupLabel: 'order ready',
    fontBody: "'Inter', system-ui, sans-serif",
    fontDisplay: "'Fraunces', 'Times New Roman', serif",
    weightNumber: 600,
    weightHead:   600,
    radius: 8,
    bg:          '#e7eef2',
    bgReady:     '#d6e3eb',
    cardPrep:    '#fbfcfa',
    cardReady:   '#ff8a5b',
    cardBorder:  'rgba(40,70,90,0.08)',
    cardBorderReady: 'transparent',
    text:        '#1f3a4d',
    textDim:     'rgba(31,58,77,0.55)',
    textCard:    '#1f3a4d',
    textCardDim: 'rgba(31,58,77,0.55)',
    textNum:     '#1f3a4d',
    textNumReady:'#fff8ef',
    headTeal:    '#ff8a5b',
    accentReady: '#fff8ef',
    activeColor: '#ff8a5b',
    storeChipBg: '#1f3a4d',
    storeChipFg: '#e7eef2',
    src: {
      POS:'#1f3a4d', MANUAL:'#ff8a5b', KIOSK:'#5a8aaa', DOORDASH:'#d96050',
      UBEREATS:'#6a9a7a', GRUBHUB:'#c46a5a', FANTUAN:'#aa5a5a', HUNGRYPANDA:'#c89a6a',
    },
    srcFg: {
      POS:'#fff8ef', MANUAL:'#fff8ef', KIOSK:'#fff8ef', DOORDASH:'#fff8ef',
      UBEREATS:'#fff8ef', GRUBHUB:'#fff8ef', FANTUAN:'#fff8ef', HUNGRYPANDA:'#fff8ef',
    },
    empChipBg: 'rgba(31,58,77,0.07)',
    empChipFg: 'rgba(31,58,77,0.75)',
    statusFg:  '#a8762a',
    readyIcon: 'square',
    readyOverrides: {
      text:        '#fff8ef',
      textDim:     'rgba(255,248,239,0.75)',
      textCard:    '#fff8ef',
      textCardDim: 'rgba(255,248,239,0.7)',
      empChipBg:   'rgba(255,248,239,0.15)',
      empChipFg:   'rgba(255,248,239,0.9)',
    },
  },

  boba: {
    name: 'Boba · Pastel',
    desc: 'Lavender + peach · Quicksand rounded. Tea bar, dessert.',
    storeLabel: 'TEA BAR',
    pickupLabel: 'order ready',
    fontBody: "'Quicksand', system-ui, sans-serif",
    fontDisplay: "'Quicksand', system-ui, sans-serif",
    weightNumber: 700,
    weightHead:   600,
    radius: 22,
    bg:          '#f3eaf6',
    bgReady:     '#f6dfe8',
    cardPrep:    '#ffffff',
    cardReady:   '#ffffff',
    cardBorder:  'rgba(80,40,80,0.06)',
    cardBorderReady: 'rgba(220,90,130,0.22)',
    text:        '#3a2840',
    textDim:     'rgba(58,40,64,0.55)',
    textCard:    '#3a2840',
    textCardDim: 'rgba(58,40,64,0.55)',
    textNum:     '#5a3a6a',
    textNumReady:'#c44c80',
    headTeal:    '#a06ec4',
    accentReady: '#c44c80',
    activeColor: '#c44c80',
    storeChipBg: '#3a2840',
    storeChipFg: '#f3eaf6',
    src: {
      POS:'#7a8ad4', MANUAL:'#e8a06c', KIOSK:'#a06ec4', DOORDASH:'#c44c80',
      UBEREATS:'#9ac49a', GRUBHUB:'#d48a8a', FANTUAN:'#c4708a', HUNGRYPANDA:'#d4a06a',
    },
    srcFg: {
      POS:'#fff', MANUAL:'#fff', KIOSK:'#fff', DOORDASH:'#fff',
      UBEREATS:'#fff', GRUBHUB:'#fff', FANTUAN:'#fff', HUNGRYPANDA:'#fff',
    },
    empChipBg: 'rgba(80,40,80,0.07)',
    empChipFg: 'rgba(80,40,80,0.75)',
    statusFg:  '#c47a4c',
    readyIcon: 'bell',
    pill: true,
  },

  lodge: {
    name: 'Mountain Lodge',
    desc: 'Forest + walnut + cream · Lora. Cozy, cabin, rustic.',
    storeLabel: 'LODGE',
    pickupLabel: 'guest pickup',
    fontBody: "'Inter', system-ui, sans-serif",
    fontDisplay: "'Lora', 'Times New Roman', serif",
    weightNumber: 700,
    weightHead:   600,
    radius: 6,
    bg:          '#1e2a23',
    bgReady:     '#2a3b30',
    cardPrep:    '#f3ebd9',
    cardReady:   '#5a3a26',
    cardBorder:  'transparent',
    cardBorderReady: 'rgba(220,180,110,0.3)',
    text:        '#f3ebd9',
    textDim:     'rgba(243,235,217,0.55)',
    textCard:    '#2c2418',
    textCardDim: 'rgba(44,36,24,0.6)',
    textNum:     '#2c2418',
    textNumReady:'#f3ebd9',
    headTeal:    '#d8a85a',
    accentReady: '#d8a85a',
    activeColor: '#d8a85a',
    storeChipBg: '#d8a85a',
    storeChipFg: '#1e2a23',
    src: {
      POS:'#3a5a4a', MANUAL:'#c46a3a', KIOSK:'#5a3a6a', DOORDASH:'#a83a2a',
      UBEREATS:'#5a7a4a', GRUBHUB:'#a86a3a', FANTUAN:'#8a4a3a', HUNGRYPANDA:'#b87a3a',
    },
    srcFg: {
      POS:'#f3ebd9', MANUAL:'#f3ebd9', KIOSK:'#f3ebd9', DOORDASH:'#f3ebd9',
      UBEREATS:'#f3ebd9', GRUBHUB:'#f3ebd9', FANTUAN:'#f3ebd9', HUNGRYPANDA:'#f3ebd9',
    },
    empChipBg: 'rgba(44,36,24,0.08)',
    empChipFg: 'rgba(44,36,24,0.75)',
    statusFg:  '#a06a2a',
    readyIcon: 'dot',
    readyOverrides: {
      empChipBg:   'rgba(243,235,217,0.16)',
      empChipFg:   'rgba(243,235,217,0.92)',
      textDim:     'rgba(243,235,217,0.65)',
      textCardDim: 'rgba(243,235,217,0.65)',
    },
  },

  speakeasy: {
    name: 'Speakeasy · Art Deco',
    desc: 'Oxblood + brass + bottle green · Cinzel. 1920s, ornate.',
    storeLabel: 'THE BAR',
    pickupLabel: 'collect orders',
    fontBody: "'Inter', system-ui, sans-serif",
    fontDisplay: "'Cinzel', 'Times New Roman', serif",
    weightNumber: 700,
    weightHead:   600,
    radius: 0,
    bg:          '#170b0c',
    bgReady:     '#0e1a16',
    cardPrep:    '#1f1213',
    cardReady:   '#1a2a23',
    cardBorder:  'rgba(196,144,72,0.15)',
    cardBorderReady: 'rgba(196,144,72,0.5)',
    text:        '#f1e6d2',
    textDim:     'rgba(241,230,210,0.5)',
    textNum:     '#e9d4a6',
    textNumReady:'#c49048',
    headTeal:    '#c49048',
    accentReady: '#c49048',
    activeColor: '#c49048',
    storeChipBg: '#c49048',
    storeChipFg: '#170b0c',
    src: {
      POS:'#5a3a2a', MANUAL:'#9a3a2a', KIOSK:'#4a2a5a', DOORDASH:'#7a3a2a',
      UBEREATS:'#4a5a3a', GRUBHUB:'#7a3a3a', FANTUAN:'#6a2a3a', HUNGRYPANDA:'#8a5a2a',
    },
    srcFg: {
      POS:'#f1e6d2', MANUAL:'#f1e6d2', KIOSK:'#f1e6d2', DOORDASH:'#f1e6d2',
      UBEREATS:'#f1e6d2', GRUBHUB:'#f1e6d2', FANTUAN:'#f1e6d2', HUNGRYPANDA:'#f1e6d2',
    },
    empChipBg: 'rgba(196,144,72,0.1)',
    empChipFg: 'rgba(196,144,72,0.85)',
    statusFg:  '#c49048',
    readyIcon: 'square',
    underline: true,
    minimal: true,
  },

  diner: {
    name: 'Mid-Century Diner',
    desc: 'Mustard + olive + Apple · Familjen Grotesk. Retro 50s.',
    storeLabel: 'DINER',
    pickupLabel: 'order up',
    fontBody: "'Inter', system-ui, sans-serif",
    fontDisplay: "'Familjen Grotesk', 'Arial Narrow', sans-serif",
    weightNumber: 700,
    weightHead:   700,
    radius: 12,
    bg:          '#f0e4cf',
    bgReady:     '#9a8a48',
    cardPrep:    '#fcf6e8',
    cardReady:   '#fcf6e8',
    cardBorder:  'rgba(60,40,20,0.08)',
    cardBorderReady: 'rgba(60,40,20,0.18)',
    text:        '#3a2818',
    textDim:     'rgba(58,40,24,0.55)',
    textCard:    '#3a2818',
    textCardDim: 'rgba(58,40,24,0.55)',
    textNum:     '#c64a3a',
    textNumReady:'#3a2818',
    headTeal:    '#c64a3a',
    accentReady: '#fcf6e8',
    activeColor: '#c64a3a',
    storeChipBg: '#c64a3a',
    storeChipFg: '#fcf6e8',
    src: {
      POS:'#3a2818', MANUAL:'#c64a3a', KIOSK:'#5a4a3a', DOORDASH:'#a06a2a',
      UBEREATS:'#6a7a3a', GRUBHUB:'#c45a3a', FANTUAN:'#8a3a2a', HUNGRYPANDA:'#a07a3a',
    },
    srcFg: {
      POS:'#fcf6e8', MANUAL:'#fcf6e8', KIOSK:'#fcf6e8', DOORDASH:'#fcf6e8',
      UBEREATS:'#fcf6e8', GRUBHUB:'#fcf6e8', FANTUAN:'#fcf6e8', HUNGRYPANDA:'#fcf6e8',
    },
    empChipBg: 'rgba(58,40,24,0.08)',
    empChipFg: 'rgba(58,40,24,0.75)',
    statusFg:  '#9a6a2a',
    readyIcon: 'arrow',
    cardOnCard: true,
  },

};

// Recommended columns per theme (per design handoff README screenshots table).
// Admin can override; this is the default to apply when user picks a theme.
export const THEME_DEFAULT_COLUMNS: Record<ThemeKey, 2 | 3 | 4> = {
  bistro: 4, cafe: 3, steakhouse: 3, sushi: 2, burger: 4, sage: 3,
  neon: 4, riviera: 3, boba: 3, lodge: 3, speakeasy: 2, diner: 4,
};

// ─── Sample data (theme picker preview + dev fixtures) ─────────────────
export const SAMPLE_PREPARING = [
  { n: 82, src: 'POS' as const,      emp: 'HENRY',    t: '353 min ago' },
  { n: 83, src: 'POS' as const,      emp: 'HENRY',    t: '353 min ago' },
  { n: 88, src: 'POS' as const,      emp: 'HENRY',    t: '353 min ago' },
  { n: 89, src: 'POS' as const,      emp: 'HENRY',    t: '352 min ago' },
  { n: 90, src: 'MANUAL' as const,   emp: 'HENRY',    t: '352 min ago' },
  { n: 91, src: 'MANUAL' as const,   emp: 'HENRY',    t: '352 min ago' },
  { n: 92, src: 'DOORDASH' as const, emp: 'HENRY',    t: '352 min ago' },
  { n: 93, src: 'KIOSK' as const,    emp: 'HENRY',    t: '352 min ago' },
  { n: 94, src: 'KIOSK' as const,    emp: 'HENRY',    t: '352 min ago' },
  { n:  2, src: 'MANUAL' as const,   emp: null,       t: '351 min ago' },
  { n:  6, src: 'MANUAL' as const,   emp: null,       t: '350 min ago' },
  { n:  8, src: 'MANUAL' as const,   emp: null,       t: '347 min ago' },
  { n:  9, src: 'MANUAL' as const,   emp: null,       t: '347 min ago' },
  { n: 10, src: 'POS' as const,      emp: 'TESTUSER', t: '273 min ago' },
  { n: 17, src: 'MANUAL' as const,   emp: null,       t: '119 min ago' },
  { n: 18, src: 'MANUAL' as const,   emp: null,       t: '119 min ago' },
  { n: 20, src: 'MANUAL' as const,   emp: null,       t: '117 min ago' },
  { n: 21, src: 'MANUAL' as const,   emp: null,       t: '117 min ago' },
  { n: 23, src: 'MANUAL' as const,   emp: null,       t: '105 min ago' },
  { n: 24, src: 'MANUAL' as const,   emp: null,       t: '105 min ago' },
];

export const SAMPLE_READY = [
  { n: 84, src: 'POS' as const, emp: 'HENRY',  t: '353 min ago' },
  { n: 85, src: 'POS' as const, emp: 'HENRY',  t: '353 min ago' },
  { n: 86, src: 'POS' as const, emp: 'HENRY',  t: '353 min ago' },
  { n: 19, src: 'POS' as const, emp: null,     t: '117 min ago' },
  { n: 22, src: 'POS' as const, emp: null,     t: '105 min ago' },
  { n: 25, src: 'POS' as const, emp: null,     t: '103 min ago' },
  { n: 28, src: 'POS' as const, emp: null,     t:  '53 min ago' },
  { n: 31, src: 'POS' as const, emp: null,     t:  '52 min ago' },
  { n: 34, src: 'POS' as const, emp: 'HENRY',  t:  '42 min ago' },
  { n: 35, src: 'POS' as const, emp: 'ANNA',   t:  '42 min ago' },
  { n: 36, src: 'POS' as const, emp: 'CARLOS', t:  '42 min ago' },
  { n: 37, src: 'POS' as const, emp: 'DMITRI', t:  '42 min ago' },
  { n: 38, src: 'POS' as const, emp: 'EVA',    t:  '42 min ago' },
  { n: 47, src: 'POS' as const, emp: null,     t:  '39 min ago' },
  { n: 50, src: 'POS' as const, emp: null,     t:   '5 min ago' },
];

export type SampleOrder = (typeof SAMPLE_PREPARING)[number];
