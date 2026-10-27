// AG-013: 모든 enum 정본 — schema.ts, 라우트, 클라이언트 모두 여기서 import
export const ORDER_SOURCE = [
  'pos', 'kiosk', 'manual', 'doordash', 'ubereats', 'grubhub', 'fantuan', 'hungrypanda',
] as const;

// AG-013 additive extension — existing 5 values kept; 4 added for spec v2.1 9-state machine.
// UI labels render via ORDER_STATUS_SPEC[status] → i18n lookup.
export const ORDER_STATUS = [
  'new', 'prep', 'ready', 'collected', 'cancelled',
  'ready_to_expedite', 'remaking', 'expired', 'scheduled',
] as const;

export const SCREEN_ROLE = [
  'menu', 'pickup', 'event', 'ai_ads',
] as const;

export const EVENT_TYPE = [
  'happy_hour', 'live_event', 'lto', 'alert', 'promo',
] as const;

// AG-013: additive 6-value daypart (Sprint 1 S1.3, 2026-05-17 D0 결정)
// 정본: [breakfast, lunch, snack, dinner, late, all] — 기존 4값 보존, snack/late 신규
// 변형 (morning, evening, all_day, closed, brunch, late_night) 금지 — pre-edit-schema-check.sh v4 차단
export const DAYPART = [
  'breakfast', 'lunch', 'snack', 'dinner', 'late', 'all',
] as const;

export const TV_FUNCTION_TYPE = ['menu', 'pickup', 'event', 'ad'] as const;
export const TV_PROFILE_TYPE  = ['menu', 'pickup', 'event'] as const;
export const PICKUP_MODE      = ['single', 'multi_venue'] as const;

// ── M01 Menu Module (Sprint 1 S1.8, 2026-05-17) ───────────────────────
// 5-Lang i18n — stores.default_language default 'en'. menu_items.name_i18n/description_i18n keys.
export const SUPPORTED_LANG = ['en','ko','es','zh','ja'] as const;

// FDA 9 major allergens (US labeling law)
export const ALLERGEN = [
  'milk','egg','fish','shellfish','tree_nut','peanut','wheat','soy','sesame',
] as const;

export const SPICE_LEVEL = ['none','mild','medium','hot','extreme'] as const;

export const ITEM_STATUS = ['active','sold_out','archived'] as const;

export const TAX_POLICY = ['exclusive','inclusive','exempt'] as const;

export const SYNC_SOURCE = [
  'restosync','toast','square','clover','chowbus','lightspeed',
] as const;

// Import (PRD v1.2 §18.9)
export const IMPORT_SOURCE = [
  'excel','csv','ai_ocr','web_scrape',
  'pos_square','pos_toast','pos_clover','pos_lightspeed','manual',
] as const;

export const IMPORT_STATUS = [
  'pending','validating','preview_ready','executing','completed','failed','cancelled',
] as const;

// Featured Banner rules (Sprint F.A — PRD §3.6 / §4.2 / BR-21)
// 정본: ['chef_pick','lto','low_inventory','daypart','analytics_star','analytics_puzzle']
// P1 active: chef_pick / lto / low_inventory(P1.5 wire) / daypart
// P2: analytics_star / analytics_puzzle (Menu Engineering Matrix)
export const FEATURED_RULE_TYPE = [
  'chef_pick','lto','low_inventory','daypart','analytics_star','analytics_puzzle',
] as const;

// stores.featured_rotation_seconds CHECK enum (5/8/10/12 — BR-21 PRD §3.6)
export const FEATURED_ROTATION_SECONDS = [5, 8, 10, 12] as const;

// Ingredients (Sprint 4 S4.6, P1.5 BR-19 — 재고 추적 + recipe N:M)
// 정본: ['g','kg','ml','L','oz','lb','each','piece','dozen']
// 변형 금지: 'gram','kilogram','milliliter','liter','ounce','pound','ea','pc','pcs','doz'
export const INGREDIENT_UNIT = [
  'g','kg','ml','L','oz','lb','each','piece','dozen',
] as const;

// Audit log (BR-06)
export const AUDIT_ENTITY_TYPE = [
  'menu_item','menu_category','menu_daypart','menu_variant','menu_modifier_group','menu_combo','menu_featured_rule','menu_ingredient',
] as const;

export const AUDIT_OPERATION = [
  'create','update','delete','sold_out_toggle','bulk_import','price_change','daypart_change','reorder',
] as const;

export const AUDIT_ACTOR = ['system','staff','webhook','import'] as const;

export type OrderSource     = (typeof ORDER_SOURCE)[number];
export type OrderStatus     = (typeof ORDER_STATUS)[number];

// Spec v2.1 canonical state labels — surfaced in UI/audit log. Internal code uses OrderStatus.
export type SpecOrderStatus =
  | 'NEW' | 'PREPARING' | 'READY_TO_EXPEDITE' | 'READY_FOR_PICKUP'
  | 'PICKED_UP' | 'REMAKING' | 'EXPIRED' | 'CANCELED' | 'SCHEDULED';

export const ORDER_STATUS_SPEC: Record<OrderStatus, SpecOrderStatus> = {
  new: 'NEW',
  prep: 'PREPARING',
  ready_to_expedite: 'READY_TO_EXPEDITE',
  ready: 'READY_FOR_PICKUP',
  remaking: 'REMAKING',
  collected: 'PICKED_UP',
  expired: 'EXPIRED',
  cancelled: 'CANCELED',
  scheduled: 'SCHEDULED',
};

// Terminal states — no outbound transitions allowed.
export const ORDER_STATUS_TERMINAL: ReadonlySet<OrderStatus> = new Set([
  'collected', 'expired', 'cancelled',
]);

// Valid transitions per state. Spec §3.3 + §3.5 (incl. accepted_at sub-state).
// 'new'→'prep' covers Auto-Accept; Manual-Accept sets accepted_at then PATCH /status to 'prep'.
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  new:               ['prep', 'scheduled', 'cancelled'],
  scheduled:         ['new', 'cancelled'],
  prep:              ['ready_to_expedite', 'ready', 'remaking', 'cancelled'],
  ready_to_expedite: ['ready', 'cancelled'],
  ready:             ['collected', 'expired', 'remaking', 'cancelled'],
  remaking:          ['prep', 'cancelled'],
  collected:         [],
  expired:           [],
  cancelled:         [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_STATUS_TRANSITIONS[from].includes(to);
}
export type ScreenRole      = (typeof SCREEN_ROLE)[number];
export type EventType       = (typeof EVENT_TYPE)[number];
export type Daypart         = (typeof DAYPART)[number];
export type TvFunctionType  = (typeof TV_FUNCTION_TYPE)[number];
export type TvProfileType   = (typeof TV_PROFILE_TYPE)[number];
export type PickupMode      = (typeof PICKUP_MODE)[number];

// ── M01 types ───────────────────────────────────────────────
export type SupportedLang     = (typeof SUPPORTED_LANG)[number];
export type Allergen          = (typeof ALLERGEN)[number];
export type SpiceLevel        = (typeof SPICE_LEVEL)[number];
export type ItemStatus        = (typeof ITEM_STATUS)[number];
export type TaxPolicy         = (typeof TAX_POLICY)[number];
export type SyncSource        = (typeof SYNC_SOURCE)[number];
export type ImportSource      = (typeof IMPORT_SOURCE)[number];
export type ImportStatus      = (typeof IMPORT_STATUS)[number];
export type AuditEntityType   = (typeof AUDIT_ENTITY_TYPE)[number];
export type AuditOperation    = (typeof AUDIT_OPERATION)[number];
export type AuditActor        = (typeof AUDIT_ACTOR)[number];
export type IngredientUnit    = (typeof INGREDIENT_UNIT)[number];
export type FeaturedRuleType        = (typeof FEATURED_RULE_TYPE)[number];
export type FeaturedRotationSeconds = (typeof FEATURED_ROTATION_SECONDS)[number];

// i18n object — at least default_language (en) populated. Other langs optional.
export type I18nString = Partial<Record<SupportedLang, string>>;
