// Sprint 1 S1.8 — Menu Module Zod schemas (M01 PRD v1.2)
// Routes (S1.9~S1.16)에서 import. AG-013 정본 enum + BR-01 priceCents + BR-11 i18n fallback.

import { z } from 'zod';
import {
  DAYPART, SUPPORTED_LANG, ALLERGEN, SPICE_LEVEL, ITEM_STATUS,
  TAX_POLICY, SYNC_SOURCE, INGREDIENT_UNIT, IMPORT_SOURCE,
  FEATURED_RULE_TYPE, FEATURED_ROTATION_SECONDS,
} from '@restosync/shared/enums';

// ── Primitives ────────────────────────────────────────────────────────────────
const UuidSchema       = z.string().uuid();
const PriceCentsSchema = z.number().int().nonnegative().max(1_000_000);  // $0 ~ $10,000
const SortOrderSchema  = z.number().int().min(-32768).max(32767);
const TimeStringSchema = z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'HH:MM 24h format');

// i18n object — 'en' required (BR-11 fallback), 다른 lang optional
const I18nString = z.object({
  en: z.string().min(1).max(200),
  ko: z.string().max(200).optional(),
  es: z.string().max(200).optional(),
  zh: z.string().max(200).optional(),
  ja: z.string().max(200).optional(),
}).strict();

const I18nText = z.object({
  en: z.string().max(2000).optional(),
  ko: z.string().max(2000).optional(),
  es: z.string().max(2000).optional(),
  zh: z.string().max(2000).optional(),
  ja: z.string().max(2000).optional(),
}).strict();

const DaypartEnum        = z.enum(DAYPART);
const AllergenEnum       = z.enum(ALLERGEN);
const SpiceLevelEnum     = z.enum(SPICE_LEVEL);
const ItemStatusEnum     = z.enum(ITEM_STATUS);
const TaxPolicyEnum      = z.enum(TAX_POLICY);
const SyncSourceEnum     = z.enum(SYNC_SOURCE);
const LangEnum           = z.enum(SUPPORTED_LANG);
const IngredientUnitEnum = z.enum(INGREDIENT_UNIT);

// ── MenuItem ────────────────────────────────────────────────────────────────

export const MenuItemCreateSchema = z.object({
  category_id:       UuidSchema.nullable().optional(),
  name_i18n:         I18nString,
  description_i18n:  I18nText.optional(),
  price_cents:       PriceCentsSchema,                                  // BR-01
  dayparts_arr:      z.array(DaypartEnum).min(1).default(['all']),
  allergens:         z.array(AllergenEnum).default([]),
  calories:          z.number().int().nonnegative().max(10_000).optional(),
  spice_level:       SpiceLevelEnum.optional(),
  available_from:    z.string().datetime({ offset: true }).nullable().optional(),  // LTO start (BR-10)
  available_until:   z.string().datetime({ offset: true }).nullable().optional(),  // LTO end
  is_featured:       z.boolean().default(false),
  is_hot:            z.boolean().default(false),
  show_on_tv:        z.boolean().default(true),
  sort_order:        SortOrderSchema.default(0),
  kitchen_name:      z.string().max(40).optional(),                     // KDS short name
  tax_policy:        TaxPolicyEnum.default('exclusive'),
  tax_category_id:   UuidSchema.optional(),
  external_id:       z.string().max(80).optional(),                     // BR-26
  image_url:         z.string().url().optional(),
}).strict();

export type MenuItemCreate = z.infer<typeof MenuItemCreateSchema>;

// PATCH — all fields optional. price_cents 변경 가능 (BR-12: 진행 주문은 snapshot 분리).
export const MenuItemUpdateSchema = MenuItemCreateSchema.partial().strict();
export type MenuItemUpdate = z.infer<typeof MenuItemUpdateSchema>;

// PATCH /api/menu/items/:id/toggle-sold-out — kitchen 권한 허용 (AM01-008)
export const ToggleSoldOutSchema = z.object({
  sold_out: z.boolean(),
  reason:   z.string().max(100).optional(),  // audit_log.reason
}).strict();
export type ToggleSoldOut = z.infer<typeof ToggleSoldOutSchema>;

// GET /api/menu/items?... (AG-021: server-side filter + max limit 필수)
// status default 'active' — sold_out 항목 제외. admin 화면은 status='any' 명시 필요.
const ItemStatusFilterEnum = z.enum([...ITEM_STATUS, 'any'] as [string, ...string[]]);
export const MenuItemListQuerySchema = z.object({
  daypart:     DaypartEnum.optional(),
  category_id: UuidSchema.optional(),
  status:      ItemStatusFilterEnum.default('active'),
  lang:        LangEnum.optional(),
  show_on_tv:  z.coerce.boolean().optional(),
  sync_source: SyncSourceEnum.optional(),
  is_featured: z.coerce.boolean().optional(),
  limit:       z.coerce.number().int().min(1).max(500).default(100),
  offset:      z.coerce.number().int().nonnegative().default(0),
}).strict();
export type MenuItemListQuery = z.infer<typeof MenuItemListQuerySchema>;

// GET /api/menu/snapshot?lang= — TV용 1회 호출 payload (BR-03)
// store_id는 JWT에서만 (AG-001 cross-store 차단).
export const MenuSnapshotQuerySchema = z.object({
  lang: LangEnum.optional(),
}).strict();
export type MenuSnapshotQuery = z.infer<typeof MenuSnapshotQuerySchema>;

// ── MenuVariant (Sprint 4 S4.5b — v1.1 BR-16) ───────────────────────────────
// price_delta_cents: signed int. effective price = items.price_cents + price_delta_cents.
// Negative deltas allowed (e.g. "Small" -$1 from base "Medium").
const PriceDeltaCentsSchema = z.number().int().min(-1_000_000).max(1_000_000);

export const VariantCreateSchema = z.object({
  name:              I18nString,
  price_delta_cents: PriceDeltaCentsSchema.default(0),
  is_default:        z.boolean().default(false),
  sort_order:        SortOrderSchema.default(0),
}).strict();
export type VariantCreate = z.infer<typeof VariantCreateSchema>;

// Defaults dropped — PATCH must not silently reset price_delta/is_default/sort_order
// when caller sends partial body (BR-12 semantic: only sent fields change).
export const VariantUpdateSchema = z.object({
  name:              I18nString.optional(),
  price_delta_cents: PriceDeltaCentsSchema.optional(),
  is_default:        z.boolean().optional(),
  sort_order:        SortOrderSchema.optional(),
}).strict();
export type VariantUpdate = z.infer<typeof VariantUpdateSchema>;

// ── ModifierOption (Sprint 4 S4.5b — v1.1 BR-16/17) ─────────────────────────
// price_delta_cents: signed int. Effective price = base + Σ selected option deltas.
export const ModifierOptionCreateSchema = z.object({
  name:              I18nString,
  price_delta_cents: PriceDeltaCentsSchema.default(0),
  is_default:        z.boolean().default(false),
  sort_order:        SortOrderSchema.default(0),
}).strict();
export type ModifierOptionCreate = z.infer<typeof ModifierOptionCreateSchema>;

export const ModifierOptionUpdateSchema = z.object({
  name:              I18nString.optional(),
  price_delta_cents: PriceDeltaCentsSchema.optional(),
  is_default:        z.boolean().optional(),
  sort_order:        SortOrderSchema.optional(),
}).strict();
export type ModifierOptionUpdate = z.infer<typeof ModifierOptionUpdateSchema>;

// ── ModifierGroup (Sprint 4 S4.5b — v1.1 BR-17) ─────────────────────────────
// max_select NULL = unlimited. is_required && min_select===0 → 422 (모순).
const ModifierGroupBaseSchema = z.object({
  name:        I18nString,
  min_select:  z.number().int().min(0).max(50).default(0),
  max_select:  z.number().int().positive().max(50).nullable().optional(),  // null = unlimited
  is_required: z.boolean().default(false),
}).strict();

export const ModifierGroupCreateSchema = ModifierGroupBaseSchema
  .extend({
    options: z.array(ModifierOptionCreateSchema).max(50).optional(),  // nested
  })
  .refine((d) => !(d.is_required && d.min_select === 0), {
    message: 'is_required=true requires min_select >= 1',
    path: ['min_select'],
  })
  .refine(
    (d) => d.max_select == null || d.max_select >= d.min_select,
    { message: 'max_select must be >= min_select', path: ['max_select'] },
  );
export type ModifierGroupCreate = z.infer<typeof ModifierGroupCreateSchema>;

// PATCH — internal consistency is checked server-side after merging with stored row,
// so no refine here (caller may legitimately send only min_select etc.).
export const ModifierGroupUpdateSchema = z.object({
  name:        I18nString.optional(),
  min_select:  z.number().int().min(0).max(50).optional(),
  max_select:  z.number().int().positive().max(50).nullable().optional(),
  is_required: z.boolean().optional(),
}).strict();
export type ModifierGroupUpdate = z.infer<typeof ModifierGroupUpdateSchema>;

// GET /api/menu/modifier-groups?...
export const ModifierGroupListQuerySchema = z.object({
  with_options: z.coerce.boolean().default(false),
  limit:        z.coerce.number().int().min(1).max(500).default(200),
  offset:       z.coerce.number().int().nonnegative().default(0),
}).strict();
export type ModifierGroupListQuery = z.infer<typeof ModifierGroupListQuerySchema>;

// ── Item↔ModifierGroup attach (Sprint 4 S4.5b — PRD §5.2) ───────────────────
export const AttachModifierGroupSchema = z.object({
  sort_order: SortOrderSchema.default(0),
}).strict();
export type AttachModifierGroup = z.infer<typeof AttachModifierGroupSchema>;

// ── MenuCategory ────────────────────────────────────────────────────────────

export const CategoryCreateSchema = z.object({
  name:        I18nString,
  icon:        z.string().max(8).optional(),         // emoji
  sort_order:  SortOrderSchema.default(0),
  is_active:   z.boolean().default(true),
  external_id: z.string().max(80).optional(),
}).strict();
export type CategoryCreate = z.infer<typeof CategoryCreateSchema>;

export const CategoryUpdateSchema = CategoryCreateSchema.partial().strict();
export type CategoryUpdate = z.infer<typeof CategoryUpdateSchema>;

// GET /api/menu/categories?... (AG-021)
export const CategoryListQuerySchema = z.object({
  is_active: z.coerce.boolean().optional(),
  limit:     z.coerce.number().int().min(1).max(500).default(200),
  offset:    z.coerce.number().int().nonnegative().default(0),
}).strict();
export type CategoryListQuery = z.infer<typeof CategoryListQuerySchema>;

// Page C 드래그 정렬 — bulk reorder (BR-13: ASC, tie-break created_at ASC)
export const CategoryReorderSchema = z.object({
  orders: z.array(
    z.object({
      id:         UuidSchema,
      sort_order: SortOrderSchema,
    }).strict()
  ).min(1).max(100),
}).strict();
export type CategoryReorder = z.infer<typeof CategoryReorderSchema>;

// ── Daypart Windows (Page D) ────────────────────────────────────────────────

const DaypartWindowSchema = z.object({
  start: TimeStringSchema,
  end:   TimeStringSchema,
}).strict();

// PUT /api/menu/dayparts — windows 객체 + 겹침 검증
// 'late'가 자정 넘는 경우(예 21:00~02:00) 허용. minute set으로 검증.
export const DaypartUpdateSchema = z.object({
  windows: z.record(DaypartEnum, DaypartWindowSchema),
}).strict().refine((data) => !hasOverlap(data.windows), {
  message: 'Daypart windows must not overlap',
  path: ['windows'],
});
export type DaypartUpdate = z.infer<typeof DaypartUpdateSchema>;

function toMin(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

function hasOverlap(windows: Partial<Record<string, { start: string; end: string }>>): boolean {
  const seen = new Set<number>();
  for (const w of Object.values(windows)) {
    if (!w) continue;
    const start = toMin(w.start);
    let end = toMin(w.end);
    if (end <= start) end += 24 * 60;  // overnight (e.g., 21:00 → 02:00 → 26:00)
    for (let m = start; m < end; m++) {
      const mod = m % (24 * 60);
      if (seen.has(mod)) return true;
      seen.add(mod);
    }
  }
  return false;
}

// ── Ingredients (Sprint 4 S4.6 — P1.5 BR-19 prep) ───────────────────────────
// numeric(12,3) → string in JSON (postgres numeric); accept number | string, coerce to string.
// Server validates as nonneg number; Drizzle expects string for decimal columns.
const QuantityStrSchema = z.union([
  z.number().nonnegative().max(1_000_000_000),
  z.string().regex(/^\d+(\.\d{1,3})?$/, 'decimal with up to 3 fraction digits'),
]).transform((v) => typeof v === 'number' ? v.toFixed(3) : v);

const QuantityPositiveStrSchema = z.union([
  z.number().positive().max(1_000_000),
  z.string().regex(/^\d+(\.\d{1,3})?$/, 'decimal with up to 3 fraction digits'),
]).transform((v) => typeof v === 'number' ? v.toFixed(3) : v);

export const IngredientCreateSchema = z.object({
  name:           I18nString,
  unit:           IngredientUnitEnum,
  stock_quantity: QuantityStrSchema.optional(),                                // default 0
  min_threshold:  QuantityStrSchema.nullable().optional(),                     // BR-19 alert (null disables)
  external_id:    z.string().max(80).optional(),
}).strict();
export type IngredientCreate = z.infer<typeof IngredientCreateSchema>;

export const IngredientUpdateSchema = z.object({
  name:           I18nString.optional(),
  unit:           IngredientUnitEnum.optional(),
  stock_quantity: QuantityStrSchema.optional(),
  min_threshold:  QuantityStrSchema.nullable().optional(),
  external_id:    z.string().max(80).nullable().optional(),
}).strict();
export type IngredientUpdate = z.infer<typeof IngredientUpdateSchema>;

// GET /api/menu/ingredients (AG-021 server-side filter + limit)
export const IngredientListQuerySchema = z.object({
  unit:        IngredientUnitEnum.optional(),
  low_stock:   z.coerce.boolean().optional(),                                  // stock < min_threshold (BR-19 dashboard)
  search:      z.string().max(80).optional(),                                  // name_i18n.en ILIKE
  limit:       z.coerce.number().int().min(1).max(500).default(200),
  offset:      z.coerce.number().int().nonnegative().default(0),
}).strict();
export type IngredientListQuery = z.infer<typeof IngredientListQuerySchema>;

// PATCH /api/menu/ingredients/:id/stock-adjust — kitchen RBAC 허용 (재고 차감/보충)
// mode: 'set' (absolute, owner/manager 권장) | 'delta' (relative, kitchen 권장)
export const StockAdjustSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('set'),   value: QuantityStrSchema }).strict(),
  z.object({
    mode: z.literal('delta'),
    delta: z.union([
      z.number().min(-1_000_000).max(1_000_000),
      z.string().regex(/^-?\d+(\.\d{1,3})?$/, 'signed decimal with up to 3 fraction digits'),
    ]).transform((v) => typeof v === 'number' ? v.toFixed(3) : v),
    reason: z.string().max(100).optional(),
  }).strict(),
]);
export type StockAdjust = z.infer<typeof StockAdjustSchema>;

// ── Recipe (Sprint 4 S4.6 — PUT 전체 교체 1tx) ──────────────────────────────
// PUT /api/menu/items/:id/recipe { lines: [{ingredient_id, quantity, unit, sort_order?}] }
// 빈 배열 허용 (recipe 전체 삭제).
export const RecipeLineSchema = z.object({
  ingredient_id: UuidSchema,
  quantity:      QuantityPositiveStrSchema,                                    // CHECK quantity > 0
  unit:          IngredientUnitEnum,
  sort_order:    SortOrderSchema.default(0),
}).strict();
export type RecipeLine = z.infer<typeof RecipeLineSchema>;

export const RecipePutSchema = z.object({
  lines: z.array(RecipeLineSchema).max(50),                                    // 한 item당 최대 50개 재료
}).strict().refine(
  // ingredient_id 중복 차단 (AG-018 복합 unique 사전 검증)
  (d) => new Set(d.lines.map((l) => l.ingredient_id)).size === d.lines.length,
  { message: 'duplicate ingredient_id in lines', path: ['lines'] },
);
export type RecipePut = z.infer<typeof RecipePutSchema>;

// ── Import (Sprint 5A — PRD §3.5 / §5.3, BR-25~34) ──────────────────────────
// IMPORT_SOURCE 정본 reference — runtime은 worker가 'excel' 하드코딩, future POS adapter는 자체 enum 검증.
void IMPORT_SOURCE;

export const ImportTemplateQuerySchema = z.object({
  format: z.enum(['xlsx', 'csv_zip']).default('xlsx'),
  lang:   LangEnum.default('en'),
}).strict();
export type ImportTemplateQuery = z.infer<typeof ImportTemplateQuerySchema>;

// Worker가 한 row를 validate할 때 쓰는 스키마 (BR-25: 달러→cents).
// dayparts, allergens는 콤마 구분, 빈 셀 허용. price_usd는 string|number 수용 + cents 변환.
export const ImportRowSchema = z.object({
  name_en:         z.string().min(1).max(200),
  name_ko:         z.string().max(200).optional().nullable(),
  name_es:         z.string().max(200).optional().nullable(),
  name_zh:         z.string().max(200).optional().nullable(),
  name_ja:         z.string().max(200).optional().nullable(),
  description_en:  z.string().max(2000).optional().nullable(),
  category_en:     z.string().max(80).optional().nullable(),
  price_usd:       z.union([
                     z.number(),
                     z.string().regex(/^-?\d+(\.\d{1,2})?$/, 'decimal with up to 2 fraction digits'),
                   ]).transform((v) => Math.round((typeof v === 'number' ? v : Number(v)) * 100)),
  dayparts:        z.string().optional().nullable(),                           // "breakfast,lunch"
  allergens:       z.string().optional().nullable(),                           // "milk,egg"
  calories:        z.union([z.number(), z.string()]).optional().nullable()
                     .transform((v) => v == null || v === '' ? null
                       : Math.round(typeof v === 'number' ? v : Number(v))),
  spice_level:     z.union([SpiceLevelEnum, z.literal('').transform(() => null)]).optional().nullable(),
  external_id:     z.string().max(80).optional().nullable(),
}).passthrough();  // unknown columns ignored
export type ImportRow = z.infer<typeof ImportRowSchema>;

// POST /api/menu/import/jobs/:id/execute — BR-30/31
export const ImportExecuteSchema = z.object({
  mode:    z.enum(['lenient', 'strict']).default('lenient'),                   // BR-31
  confirm: z.literal(true),                                                    // BR-30 — "NOT reversible" checkbox required
}).strict();
export type ImportExecute = z.infer<typeof ImportExecuteSchema>;

// ── Featured Banner rules (Sprint F.A — PRD §3.6 / §4.2 / BR-21) ────────────
// rule_type 별 params 구조:
//   chef_pick     → {} (params 비어 있음 — is_featured=true pool)
//   lto           → { threshold_days?: number(0.25~30) }  default 2
//   low_inventory → { threshold_multiplier?: number(1~20) } default 5 (P1.5 wire)
//   daypart       → {} (current daypart 자동)
// PUT /api/menu/featured/rules body: { rules: [...], rotation_seconds }
const FeaturedRuleTypeEnum   = z.enum(FEATURED_RULE_TYPE);
const FeaturedRotationSecEnum = z.union(
  FEATURED_ROTATION_SECONDS.map((n) => z.literal(n)) as unknown as
    [z.ZodLiteral<number>, z.ZodLiteral<number>, ...z.ZodLiteral<number>[]],
);

const FeaturedRuleParamsSchema = z.object({
  threshold_days:        z.number().positive().max(30).optional(),             // lto
  threshold_multiplier:  z.number().int().min(1).max(20).optional(),           // low_inventory (P1.5)
}).strict();

export const FeaturedRuleUpsertSchema = z.object({
  rule_type:  FeaturedRuleTypeEnum,
  is_active:  z.boolean().default(true),
  priority:   z.number().int().min(0).max(1000).default(100),
  params:     FeaturedRuleParamsSchema.default({}),
}).strict();
export type FeaturedRuleUpsert = z.infer<typeof FeaturedRuleUpsertSchema>;

// PUT /api/menu/featured/rules — 전체 교체 (한 store rule 집합 정본)
export const FeaturedRulesPutSchema = z.object({
  rules:             z.array(FeaturedRuleUpsertSchema).max(FEATURED_RULE_TYPE.length).default([]),
  rotation_seconds:  FeaturedRotationSecEnum.optional(),                       // omit → 변경 없음
}).strict().refine(
  // AG-018: rule_type 중복 차단
  (d) => new Set(d.rules.map((r) => r.rule_type)).size === d.rules.length,
  { message: 'duplicate rule_type in rules', path: ['rules'] },
);
export type FeaturedRulesPut = z.infer<typeof FeaturedRulesPutSchema>;

// GET /api/menu/featured/current?tv_instance_id= — TV에서 호출, 풀 + 회전 간격 반환
export const FeaturedCurrentQuerySchema = z.object({
  tv_instance_id: UuidSchema.optional(),                                        // P2 per-TV override hook
  lang:           LangEnum.optional(),
  limit:          z.coerce.number().int().min(1).max(20).default(8),
}).strict();
export type FeaturedCurrentQuery = z.infer<typeof FeaturedCurrentQuerySchema>;

// ── Combos (Sprint G.A — PRD §4.2 Page G / §7.2 / BR-18/23) ─────────────────
// price_cents: 콤보가 (cents, BR-01). BR-23은 라우트에서 items 합산 후 검증(422).
// items[]: 콤보 구성 (FK menu_items, qty, BR-18 substitutable group). 1~20개.

export const ComboItemLineSchema = z.object({
  item_id:          UuidSchema,
  quantity:         z.number().int().min(1).max(99).default(1),
  is_substitutable: z.boolean().default(false),                                 // BR-18
  group_name:       z.string().min(1).max(40).nullable().optional(),            // 'Main' | 'Side' | 'Drink' (free text)
  sort_order:       SortOrderSchema.default(0),
}).strict();
export type ComboItemLine = z.infer<typeof ComboItemLineSchema>;

const ComboItemsArraySchema = z.array(ComboItemLineSchema).min(1).max(20).refine(
  // AG-018: 같은 콤보에 같은 item 중복 차단
  (lines) => new Set(lines.map((l) => l.item_id)).size === lines.length,
  { message: 'duplicate item_id in items', path: ['items'] },
);

export const ComboCreateSchema = z.object({
  name:        I18nString,
  description: I18nText.optional(),
  photo_url:   z.string().url().max(500).nullable().optional(),
  price_cents: PriceCentsSchema.refine((n) => n > 0, { message: 'price_cents must be > 0' }),  // > 0 (CHECK)
  dayparts_arr: z.array(DaypartEnum).min(1).default(['all']),
  is_featured:  z.boolean().default(false),
  show_on_tv:   z.boolean().default(true),
  sort_order:   SortOrderSchema.default(0),
  items:        ComboItemsArraySchema,
}).strict();
export type ComboCreate = z.infer<typeof ComboCreateSchema>;

// PATCH: 모든 필드 optional, items 제공 시 전체 교체 (recipe pattern).
export const ComboPatchSchema = z.object({
  name:        I18nString.optional(),
  description: I18nText.nullable().optional(),
  photo_url:   z.string().url().max(500).nullable().optional(),
  price_cents: PriceCentsSchema.refine((n) => n > 0, { message: 'price_cents must be > 0' }).optional(),
  dayparts_arr: z.array(DaypartEnum).min(1).optional(),
  is_sold_out:  z.boolean().optional(),
  is_featured:  z.boolean().optional(),
  show_on_tv:   z.boolean().optional(),
  sort_order:   SortOrderSchema.optional(),
  items:        ComboItemsArraySchema.optional(),                               // omit → items 변경 없음
}).strict().refine(
  (d) => Object.keys(d).length > 0,
  { message: 'at least one field required' },
);
export type ComboPatch = z.infer<typeof ComboPatchSchema>;

export const ComboListQuerySchema = z.object({
  daypart:  DaypartEnum.optional(),
  status:   z.enum(['active', 'sold_out', 'all']).default('active'),            // AG-021 server-side filter
  lang:     LangEnum.optional(),
  limit:    z.coerce.number().int().min(1).max(100).default(50),
}).strict();
export type ComboListQuery = z.infer<typeof ComboListQuerySchema>;
