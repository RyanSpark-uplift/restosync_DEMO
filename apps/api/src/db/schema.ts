import {
  pgTable, uuid, varchar, decimal, boolean, timestamp,
  text, jsonb, pgEnum, integer, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ── Enums (AG-013: shared/enums.ts 정본과 동기화 필수) ──────────────────────
export const orderSourceEnum = pgEnum('order_source', [
  'pos', 'kiosk', 'manual', 'doordash', 'ubereats', 'grubhub', 'fantuan', 'hungrypanda',
]);
// AG-013 additive — mirrors packages/shared/src/enums.ts. Order matters: legacy 5 first, new 4 last.
export const orderStatusEnum = pgEnum('order_status', [
  'new', 'prep', 'ready', 'collected', 'cancelled',
  'ready_to_expedite', 'remaking', 'expired', 'scheduled',
]);

// Order priority — spec §18.
export const orderPriorityEnum = pgEnum('order_priority', [
  'normal', 'rush', 'scheduled', 'catering',
]);
export const screenRoleEnum = pgEnum('screen_role', [
  'menu', 'pickup', 'event', 'ai_ads',
]);
export const eventTypeEnum = pgEnum('event_type', [
  'happy_hour', 'live_event', 'lto', 'alert', 'promo',
]);
// AG-013: additive 6-value daypart (Sprint 1 S1.3, 2026-05-17 D0)
// 정본: shared/enums.ts DAYPART와 1:1. snack/late 추가는 ALTER TYPE ADD VALUE (migration 0006).
export const daypartEnum = pgEnum('daypart', [
  'breakfast', 'lunch', 'snack', 'dinner', 'late', 'all',
]);

// ── stores ───────────────────────────────────────────────────────────────────
// Sprint 1 S1.5 (M01 PRD v1.2 §7.3) — i18n + currency 확장
export const stores = pgTable('stores', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  name:                varchar('name', { length: 80 }).notNull(),
  slug:                varchar('slug', { length: 40 }).unique().notNull(),
  license_key:         varchar('license_key', { length: 30 }).unique(),
  timezone:            varchar('timezone', { length: 50 }).default('America/Los_Angeles'),
  pos_type:            varchar('pos_type', { length: 20 }),
  subscription_tier:   varchar('subscription_tier', { length: 20 }).default('basic'),
  brand_color:         varchar('brand_color', { length: 7 }).default('#E8450A'),
  logo_url:            text('logo_url'),
  // ── M01 S1.5 신규 ────────────────────────────────────────────────────
  default_language:    varchar('default_language', { length: 5 }).default('en').notNull(),    // SUPPORTED_LANG enum
  supported_languages: text('supported_languages').array().default(sql`'{en}'::text[]`).notNull(),         // ['en','ko',...]
  currency:            varchar('currency', { length: 3 }).default('USD').notNull(),           // ISO 4217
  daypart_windows:     jsonb('daypart_windows').$type<Record<string, { start: string; end: string }>>(),  // M01 6-Daypart
  business_hours:      jsonb('business_hours').$type<Record<string, { open: string; close: string }>>(), // 영업 시간 (요일별)
  featured_rotation_seconds: integer('featured_rotation_seconds').notNull().default(8),                    // BR-21 — 5/8/10/12 CHECK (migration 0019)
  created_at:          timestamp('created_at').defaultNow(),
});

// ── users ────────────────────────────────────────────────────────────────────
// AG-005: 잠금은 Redis에서 처리 (auth:lock:<store_id>:<user_id>), DB는 통계만
export const users = pgTable('users', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  store_id:            uuid('store_id').notNull().references(() => stores.id),
  name:                varchar('name', { length: 40 }).notNull(),
  pin_hash:            varchar('pin_hash', { length: 60 }).notNull(),
  role:                varchar('role', { length: 20 }).default('staff'),
  total_failed_logins: integer('total_failed_logins').default(0),
  last_login_at:       timestamp('last_login_at'),
  created_at:          timestamp('created_at').defaultNow(),
});

// ── refresh_tokens ───────────────────────────────────────────────────────────
// AG-006: jti 기반 revocation — Redis TTL + 이 테이블에 영구 백업
export const refresh_tokens = pgTable('refresh_tokens', {
  jti:           uuid('jti').primaryKey(),
  user_id:       uuid('user_id').notNull().references(() => users.id),
  store_id:      uuid('store_id').notNull().references(() => stores.id),
  issued_at:     timestamp('issued_at').defaultNow(),
  expires_at:    timestamp('expires_at').notNull(),
  revoked_at:    timestamp('revoked_at'),
  revoke_reason: varchar('revoke_reason', { length: 30 }),
}, (t) => ({
  byUser:    index('rt_user_idx').on(t.user_id),
  byExpiry:  index('rt_active_idx').on(t.expires_at),
}));

// ── orders ───────────────────────────────────────────────────────────────────
// AG-018: (store_id, display_number) partial unique WHERE status NOT IN ('collected','cancelled','expired')
// → drizzle-kit이 partial index 미지원 → migration SQL 0005_pickup_v2.sql 에서 갱신
export const orders = pgTable('orders', {
  id:                       uuid('id').primaryKey().defaultRandom(),
  store_id:                 uuid('store_id').notNull().references(() => stores.id),
  display_number:           varchar('display_number', { length: 10 }).notNull(),
  customer_name:            varchar('customer_name', { length: 60 }),
  customer_phone:           varchar('customer_phone', { length: 20 }),
  status:                   orderStatusEnum('status').default('new'),
  source:                   orderSourceEnum('source').default('manual'),
  priority:                 orderPriorityEnum('priority').default('normal'),
  items:                    jsonb('items'),
  items_summary:            text('items_summary'),
  external_id:              varchar('external_id', { length: 80 }),
  pickup_location:          varchar('pickup_location', { length: 40 }),
  pickup_time:              timestamp('pickup_time'),               // for scheduled orders
  estimated_prep_minutes:   integer('estimated_prep_minutes'),
  // Transition timestamps — fill on each PATCH /status. accepted_at is the §3.5 sub-state.
  created_at:               timestamp('created_at').defaultNow(),
  accepted_at:              timestamp('accepted_at'),
  preparing_at:             timestamp('preparing_at'),
  expedite_at:              timestamp('expedite_at'),
  ready_at:                 timestamp('ready_at'),
  collected_at:             timestamp('collected_at'),              // alias of picked_up
  picked_up_at:             timestamp('picked_up_at'),
  expired_at:               timestamp('expired_at'),
}, (t) => ({
  storeStatusIdx:   index('orders_store_status_idx').on(t.store_id, t.status),
  storePriorityIdx: index('orders_store_priority_idx').on(t.store_id, t.priority),
  storePickupTime:  index('orders_store_pickup_time_idx').on(t.store_id, t.pickup_time),
}));

// ── menu_categories (Sprint 1 S1.1, M01 PRD v1.2 §4.3 Page C) ────────────────
// AG-001/018: store_id FK cascade + (store_id, external_id) partial unique (BR-26)
// Partial unique WHERE external_id IS NOT NULL AND deleted_at IS NULL → SQL 직접 (drizzle-kit 미지원)
export const menu_categories = pgTable('menu_categories', {
  id:          uuid('id').primaryKey().defaultRandom(),
  store_id:    uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  name:        jsonb('name').$type<Record<string, string>>().notNull(),  // i18n {en, ko, es, zh, ja}
  icon:        varchar('icon', { length: 8 }),                            // emoji
  sort_order:  integer('sort_order').default(0).notNull(),
  is_active:   boolean('is_active').default(true).notNull(),
  external_id: varchar('external_id', { length: 80 }),                    // Excel import 매칭 키
  created_at:  timestamp('created_at').defaultNow().notNull(),
  updated_at:  timestamp('updated_at').defaultNow().notNull(),
  deleted_at:  timestamp('deleted_at'),                                   // BR-05 soft delete
}, (t) => ({
  storeSort: index('menu_cat_store_sort_idx').on(t.store_id, t.sort_order),
}));

// ── menu_items ────────────────────────────────────────────────────────────────
// Sprint 1 S1.2 (M01 PRD v1.2 §7.2 + v1.1) — additive 확장
// 기존 컬럼은 그대로 유지 (price/name/description/dayparts/category).
// 새 컬럼이 정본 (price_cents, name_i18n, description_i18n, category_id 등).
// 코드 마이그레이션(S1.9~S1.16) 완료 후 별도 마이그레이션에서 기존 컬럼 drop.
export const menu_items = pgTable('menu_items', {
  id:          uuid('id').primaryKey().defaultRandom(),
  store_id:    uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  // ── Legacy columns (Sprint 5+ drop 예정) ──
  category:    varchar('category', { length: 40 }),
  name:        varchar('name', { length: 80 }).notNull(),
  description: text('description'),
  price:       decimal('price', { precision: 10, scale: 2 }),
  image_url:   text('image_url'),
  available:   boolean('available').default(true),
  dayparts:    jsonb('dayparts'),  // legacy jsonb — 새 정본은 dayparts_arr text[]
  tags:        jsonb('tags'),
  sort_order:      integer('sort_order').default(0),
  photo_url_nobg:  text('photo_url_nobg'),
  is_featured:     boolean('is_featured').default(false),
  is_hot:          boolean('is_hot').default(false),
  sold_out:        boolean('sold_out').default(false),
  created_at:      timestamp('created_at').defaultNow(),

  // ── M01 S1.2 정본 (Sprint 1 신규) ───────────────────────────────────
  price_cents:      integer('price_cents'),                                                // BR-01 정본
  name_i18n:        jsonb('name_i18n').$type<Record<string, string>>(),                    // {en, ko, es, zh, ja} (BR-11)
  description_i18n: jsonb('description_i18n').$type<Record<string, string>>(),
  dayparts_arr:     text('dayparts_arr').array(),                                          // ['breakfast','lunch'] (M01 §7.2)
  category_id:      uuid('category_id').references(() => menu_categories.id, { onDelete: 'set null' }),
  // Modifiers/Variants (v1.1)
  has_variants:     boolean('has_variants').notNull().default(false),
  has_modifiers:    boolean('has_modifiers').notNull().default(false),
  // Tax policy (v1.1 §9)
  tax_policy:       text('tax_policy').notNull().default('exclusive'),                     // exclusive | inclusive | exempt
  tax_category_id:  uuid('tax_category_id'),                                               // Phase 2 FK
  // POS Sync (v1.1 §10)
  sync_source:      text('sync_source').notNull().default('restosync'),                    // restosync|toast|square|clover|chowbus (BR-20)
  external_id:      varchar('external_id', { length: 80 }),                                // Excel/POS import 매칭 (BR-26)
  external_updated_at: timestamp('external_updated_at'),
  last_synced_at:   timestamp('last_synced_at'),
  sync_conflict_at: timestamp('sync_conflict_at'),
  // Import (v1.2 §18)
  import_job_id:    uuid('import_job_id'),
  import_source:    text('import_source'),                                                 // IMPORT_SOURCE enum
  // Photo lifecycle (Sprint 2 S2.1 / AM01-005 / AG-022) — BullMQ async transcode
  // migration 0014_menu_items_photo_status.sql 동기화. CHECK: NULL | pending | processing | ready | failed
  photo_status:        text('photo_status'),                                               // null=no photo, set by /upload + worker
  photo_transcoded_at: timestamp('photo_transcoded_at'),                                   // worker가 image_url commit한 시각
  photo_size_bytes:    integer('photo_size_bytes'),                                        // WebP 결과 크기 (모니터링용)
  photo_job_id:        varchar('photo_job_id', { length: 60 }),                            // BullMQ job id — audit/replay
  // Allergens / Calories / Spice (M01 §4.2 Tab 3)
  calories:         integer('calories'),
  spice_level:      text('spice_level'),                                                   // SPICE_LEVEL enum
  allergens:        text('allergens').array().default(sql`'{}'::text[]`),                                 // FDA 9
  // LTO (BR-10)
  available_from:   timestamp('available_from'),
  available_until:  timestamp('available_until'),
  // Display
  kitchen_name:     varchar('kitchen_name', { length: 40 }),                               // KDS 약식 (Toast 패턴)
  show_on_tv:       boolean('show_on_tv').notNull().default(true),
  // Audit
  updated_at:       timestamp('updated_at').notNull().defaultNow(),
  deleted_at:       timestamp('deleted_at'),                                               // BR-05 soft delete
});

// ── menu_audit_log (Sprint 1 S1.4, BR-06) ─────────────────────────────────────
// Mutation 자동 로그. middleware/audit.ts (S1.16)가 모든 PATCH/DELETE 시 1행 작성.
// Append-only, no UPDATE/DELETE (BR-06).
export const menu_audit_log = pgTable('menu_audit_log', {
  id:          uuid('id').primaryKey().defaultRandom(),
  store_id:    uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  entity_type: varchar('entity_type', { length: 30 }).notNull(),                   // 'menu_item' | 'menu_category' | 'menu_daypart' | 'menu_variant' | 'menu_combo' | ...
  entity_id:   uuid('entity_id').notNull(),
  operation:   varchar('operation', { length: 20 }).notNull(),                     // 'create' | 'update' | 'delete' | 'sold_out_toggle' | 'bulk_import' | 'price_change'
  before:      jsonb('before'),                                                    // null for create
  after:       jsonb('after'),                                                     // null for delete
  user_id:     uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  actor:       varchar('actor', { length: 16 }).notNull().default('staff'),       // 'system' | 'staff' | 'webhook' | 'import'
  reason:      varchar('reason', { length: 100 }),                                 // optional context
  ts:          timestamp('ts').notNull().defaultNow(),
}, (t) => ({
  storeTsIdx:       index('menu_audit_store_ts_idx').on(t.store_id, t.ts),
  storeEntityIdx:   index('menu_audit_store_entity_idx').on(t.store_id, t.entity_type, t.entity_id),
}));

// ── menu_variants (Sprint 4 S4.5a — v1.1 Modifiers/Variants) ─────────────────
// PRD M01 §3.2 #5 — size variants per item. BR-16: effective price = items.price_cents + price_delta_cents.
// AG-001 store_id 필수 / BR-05 soft delete / 5-lang i18n name jsonb.
export const menu_variants = pgTable('menu_variants', {
  id:                uuid('id').primaryKey().defaultRandom(),
  store_id:          uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  item_id:           uuid('item_id').notNull().references(() => menu_items.id, { onDelete: 'cascade' }),
  name:              jsonb('name').$type<Record<string, string>>().notNull(),    // {en, ko, es, zh, ja}
  price_delta_cents: integer('price_delta_cents').notNull().default(0),           // BR-16
  is_default:        boolean('is_default').notNull().default(false),
  sort_order:        integer('sort_order').notNull().default(0),
  created_at:        timestamp('created_at').notNull().defaultNow(),
  updated_at:        timestamp('updated_at').notNull().defaultNow(),
  deleted_at:        timestamp('deleted_at'),                                     // BR-05
}, (t) => ({
  storeItemSortIdx: index('menu_variants_store_item_sort_idx').on(t.store_id, t.item_id, t.sort_order),
}));

// ── menu_modifier_groups (Sprint 4 S4.5a) ────────────────────────────────────
// PRD M01 §3.2 #5 — store-scoped 재사용 그룹 ("Toppings", "Sauce"). BR-17 min/max 검증은 M02 주문 시.
// max_select NULL = unlimited. is_required=true && min_select=0 은 모순 — Zod refine으로 차단.
export const menu_modifier_groups = pgTable('menu_modifier_groups', {
  id:           uuid('id').primaryKey().defaultRandom(),
  store_id:     uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  name:         jsonb('name').$type<Record<string, string>>().notNull(),
  min_select:   integer('min_select').notNull().default(0),
  max_select:   integer('max_select'),
  is_required:  boolean('is_required').notNull().default(false),
  created_at:   timestamp('created_at').notNull().defaultNow(),
  updated_at:   timestamp('updated_at').notNull().defaultNow(),
  deleted_at:   timestamp('deleted_at'),
}, (t) => ({
  storeIdx: index('menu_mod_groups_store_idx').on(t.store_id),
}));

// ── menu_modifier_options (Sprint 4 S4.5a) ───────────────────────────────────
// Group 내 선택지 ("Pepperoni" $1.50). BR-16 동일: effective price = base + Σ option deltas.
export const menu_modifier_options = pgTable('menu_modifier_options', {
  id:                uuid('id').primaryKey().defaultRandom(),
  store_id:          uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  group_id:          uuid('group_id').notNull().references(() => menu_modifier_groups.id, { onDelete: 'cascade' }),
  name:              jsonb('name').$type<Record<string, string>>().notNull(),
  price_delta_cents: integer('price_delta_cents').notNull().default(0),
  is_default:        boolean('is_default').notNull().default(false),
  sort_order:        integer('sort_order').notNull().default(0),
  created_at:        timestamp('created_at').notNull().defaultNow(),
  updated_at:        timestamp('updated_at').notNull().defaultNow(),
  deleted_at:        timestamp('deleted_at'),
}, (t) => ({
  storeGroupSortIdx: index('menu_mod_options_store_group_sort_idx').on(t.store_id, t.group_id, t.sort_order),
}));

// ── menu_item_modifier_groups (Sprint 4 S4.5a — N:M attach) ──────────────────
// PRD §5.2 attach/detach. AG-018 복합 unique: 동일 item에 동일 group 중복 attach 차단.
export const menu_item_modifier_groups = pgTable('menu_item_modifier_groups', {
  store_id:    uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  item_id:     uuid('item_id').notNull().references(() => menu_items.id, { onDelete: 'cascade' }),
  group_id:    uuid('group_id').notNull().references(() => menu_modifier_groups.id, { onDelete: 'cascade' }),
  sort_order:  integer('sort_order').notNull().default(0),
  created_at:  timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  uniq:        uniqueIndex('menu_item_mod_groups_uniq').on(t.store_id, t.item_id, t.group_id),
  itemSortIdx: index('menu_item_mod_groups_item_sort_idx').on(t.store_id, t.item_id, t.sort_order),
}));

// ── menu_ingredients (Sprint 4 S4.6 — P1.5 BR-19 Auto-86) ────────────────────
// PRD M01 §3.9 / §5.4. Store-scoped 재료 카탈로그. Recipe(menu_item_ingredients) N:M로 menu_items에 연결.
// BR-19: stock_quantity < (recipe quantity × 5) → 백그라운드 worker가 menu_items.sold_out=true (P1.5 worker).
// AG-001 store_id 필수 / BR-05 soft delete / 5-lang i18n name jsonb.
// unit은 CHECK constraint (INGREDIENT_UNIT enum 정본) — text+CHECK 패턴(tax_policy/spice_level/sync_source와 동일).
export const menu_ingredients = pgTable('menu_ingredients', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  store_id:            uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  name:                jsonb('name').$type<Record<string, string>>().notNull(),       // i18n {en, ko, es, zh, ja}
  unit:                text('unit').notNull(),                                        // INGREDIENT_UNIT enum (CHECK)
  stock_quantity:      decimal('stock_quantity', { precision: 12, scale: 3 }).notNull().default('0'),  // 현재 재고
  min_threshold:       decimal('min_threshold', { precision: 12, scale: 3 }),         // BR-19 alert 기준 (NULL = 비활성)
  external_id:         varchar('external_id', { length: 80 }),                        // POS/Excel import 매칭 (BR-26)
  created_at:          timestamp('created_at').notNull().defaultNow(),
  updated_at:          timestamp('updated_at').notNull().defaultNow(),
  deleted_at:          timestamp('deleted_at'),                                       // BR-05 soft delete
}, (t) => ({
  storeIdx:            index('menu_ingredients_store_idx').on(t.store_id),
  storeStockIdx:       index('menu_ingredients_store_stock_idx').on(t.store_id, t.stock_quantity),  // BR-19 worker scan
}));

// ── menu_item_ingredients (Sprint 4 S4.6 — recipe N:M) ───────────────────────
// PRD §3.2 #6. Item당 recipe lines. AG-018 복합 unique (store_id, item_id, ingredient_id).
// PUT 전체 교체 1tx — 부분 수정 없음. quantity는 numeric(10,3) — 0.001 단위 (예: 0.250 L, 1.500 kg).
// unit은 row마다 자유 (ingredient.unit과 다를 수 있음 — 변환은 P2).
export const menu_item_ingredients = pgTable('menu_item_ingredients', {
  store_id:      uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  item_id:       uuid('item_id').notNull().references(() => menu_items.id, { onDelete: 'cascade' }),
  ingredient_id: uuid('ingredient_id').notNull().references(() => menu_ingredients.id, { onDelete: 'restrict' }),
  quantity:      decimal('quantity', { precision: 10, scale: 3 }).notNull(),         // per serving
  unit:          text('unit').notNull(),                                              // INGREDIENT_UNIT enum (CHECK)
  sort_order:    integer('sort_order').notNull().default(0),
  created_at:    timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  uniq:          uniqueIndex('menu_item_ingredients_uniq').on(t.store_id, t.item_id, t.ingredient_id),
  itemSortIdx:   index('menu_item_ingredients_item_sort_idx').on(t.store_id, t.item_id, t.sort_order),
  ingredientIdx: index('menu_item_ingredients_ingredient_idx').on(t.store_id, t.ingredient_id),  // BR-19 역추적
}));

// ── menu_import_jobs (Sprint 5A — Excel/CSV import 8-step) ───────────────────
// PRD M01 §3.5 / §5.3. AG-001 store_id 필수. BR-30 NOT reversible / BR-31 lenient/strict.
// BR-33: store당 동시 1 job (active job partial unique 별도 migration 0018).
// raw_path = filesystem temp path (./tmp/import/<job_id>.xlsx) — P2에서 R2 키로 이전 + BR-27 24h TTL 자동 삭제.
// errors_jsonb / preview_jsonb는 worker가 채움. status는 IMPORT_STATUS enum 정본(text + CHECK).
export const menu_import_jobs = pgTable('menu_import_jobs', {
  id:             uuid('id').primaryKey().defaultRandom(),
  store_id:       uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  user_id:        uuid('user_id').notNull().references(() => users.id, { onDelete: 'set null' }),
  source:         text('source').notNull(),                                            // IMPORT_SOURCE
  status:         text('status').notNull().default('pending'),                         // IMPORT_STATUS
  filename:       varchar('filename', { length: 200 }),
  raw_path:       text('raw_path'),                                                    // local fs (P1) / R2 key (P2)
  total_rows:     integer('total_rows').notNull().default(0),
  valid_rows:     integer('valid_rows').notNull().default(0),
  invalid_rows:   integer('invalid_rows').notNull().default(0),
  errors:         jsonb('errors').$type<Array<{ row: number; field?: string; message: string }>>(),
  preview:        jsonb('preview').$type<Array<Record<string, unknown>>>(),
  mode:           text('mode'),                                                        // 'lenient' | 'strict' (set on execute)
  created_at:     timestamp('created_at').notNull().defaultNow(),
  started_at:     timestamp('started_at'),
  finished_at:    timestamp('finished_at'),
  deleted_at:     timestamp('deleted_at'),                                             // BR-27 cleanup tracking
}, (t) => ({
  storeCreatedIdx: index('menu_import_jobs_store_created_idx').on(t.store_id, t.created_at),
  storeStatusIdx:  index('menu_import_jobs_store_status_idx').on(t.store_id, t.status),
}));

// ── menu_featured_rules (Sprint F.A — PRD §3.6 / §4.2 / BR-21) ───────────────
// Featured Banner Rotation (Zone B) 규칙 config. store당 rule_type 1 row (AG-018).
// rule_type CHECK: chef_pick / lto / low_inventory / daypart / analytics_star(P2) / analytics_puzzle(P2)
// params 예시:
//   { threshold_days: 2 }       — lto: available_until 임박 기준
//   { threshold_multiplier: 5 } — low_inventory: BR-19 stock × N (P1.5)
// rotation 간격은 stores.featured_rotation_seconds (5/8/10/12s).
export const menu_featured_rules = pgTable('menu_featured_rules', {
  id:         uuid('id').primaryKey().defaultRandom(),
  store_id:   uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  rule_type:  text('rule_type').notNull(),                                              // FEATURED_RULE_TYPE
  is_active:  boolean('is_active').notNull().default(true),
  priority:   integer('priority').notNull().default(100),                               // DESC 정렬 (PRD §4.2)
  params:     jsonb('params').$type<Record<string, unknown>>().notNull().default({}),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  uniq:           uniqueIndex('menu_featured_rules_store_type_uniq').on(t.store_id, t.rule_type),
  storeActiveIdx: index('menu_featured_rules_store_active_idx').on(t.store_id, t.is_active),
}));

// ── menu_combos (Sprint G.A — PRD §4.2 Page G / §7.2 / BR-18/23) ─────────────
// 콤보·번들 정본. 한 묶음(price_cents)에 multiple menu_items (menu_combo_items N:M).
// BR-23: price_cents ≤ Σ(item.price_cents × qty). 검증은 라우트(트랜잭션 안에서) 시 enforce.
// items_total_cents/savings_cents는 캐시(참조용) — 콤보/아이템 변경 시 동일 tx에서 재계산.
// AG-001 store_id 필수 / BR-05 soft delete / 5-lang i18n name.
export const menu_combos = pgTable('menu_combos', {
  id:                uuid('id').primaryKey().defaultRandom(),
  store_id:          uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  name:              jsonb('name').$type<Record<string, string>>().notNull(),       // i18n {en, ko, es, zh, ja}
  description:       jsonb('description').$type<Record<string, string>>(),          // i18n optional
  photo_url:         text('photo_url'),
  price_cents:       integer('price_cents').notNull(),                              // 콤보 가격 (BR-01)
  items_total_cents: integer('items_total_cents').notNull().default(0),             // Σ(item.price × qty) cache (BR-23 참조)
  savings_cents:     integer('savings_cents').notNull().default(0),                 // = items_total_cents - price_cents (>=0)
  dayparts_arr:      text('dayparts_arr').array().notNull().default(sql`'{all}'::text[]`),       // DAYPART (AG-013)
  is_sold_out:       boolean('is_sold_out').notNull().default(false),
  is_featured:       boolean('is_featured').notNull().default(false),
  show_on_tv:        boolean('show_on_tv').notNull().default(true),
  sort_order:        integer('sort_order').notNull().default(0),
  created_at:        timestamp('created_at').notNull().defaultNow(),
  updated_at:        timestamp('updated_at').notNull().defaultNow(),
  deleted_at:        timestamp('deleted_at'),                                       // BR-05
}, (t) => ({
  storeSortIdx:      index('menu_combos_store_sort_idx').on(t.store_id, t.sort_order),
  storeFeaturedIdx:  index('menu_combos_store_featured_idx').on(t.store_id, t.is_featured),
}));

// ── menu_combo_items (Sprint G.A — combo 구성 N:M) ───────────────────────────
// PRD §7.2. AG-018 복합 unique (store_id, combo_id, item_id) — 같은 콤보에 같은 아이템 중복 차단.
// item_id FK는 RESTRICT — 콤보에 포함된 menu_item soft-delete 시 차단(라우트에서 409 안내).
// is_substitutable + group_name (BR-18): "Choose 1 of these in Main/Side/Drink group".
export const menu_combo_items = pgTable('menu_combo_items', {
  store_id:        uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  combo_id:        uuid('combo_id').notNull().references(() => menu_combos.id, { onDelete: 'cascade' }),
  item_id:         uuid('item_id').notNull().references(() => menu_items.id, { onDelete: 'restrict' }),
  quantity:        integer('quantity').notNull().default(1),
  is_substitutable: boolean('is_substitutable').notNull().default(false),           // BR-18
  group_name:      varchar('group_name', { length: 40 }),                           // 'Main' | 'Side' | 'Drink' (BR-18)
  sort_order:      integer('sort_order').notNull().default(0),
  created_at:      timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  uniq:           uniqueIndex('menu_combo_items_uniq').on(t.store_id, t.combo_id, t.item_id),
  comboSortIdx:   index('menu_combo_items_combo_sort_idx').on(t.store_id, t.combo_id, t.sort_order),
  itemReverseIdx: index('menu_combo_items_item_idx').on(t.store_id, t.item_id),     // delete-item lookup
}));

// ── tv_screens ────────────────────────────────────────────────────────────────
// AG-008: pairing_code partial unique WHERE pairing_code IS NOT NULL
//         + pairing_expires_at (발급 후 10분)
// → 별도 migration SQL로 추가 (0002_partial_indexes.sql)
export const tv_screens = pgTable('tv_screens', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  store_id:           uuid('store_id').notNull().references(() => stores.id),
  role:               screenRoleEnum('role').notNull(),
  name:               varchar('name', { length: 40 }),
  pairing_code:       varchar('pairing_code', { length: 6 }),
  pairing_expires_at: timestamp('pairing_expires_at'),
  last_seen_at:       timestamp('last_seen_at'),
  app_version:        varchar('app_version', { length: 20 }),
  online:             boolean('online').default(false),
});

// ── events ────────────────────────────────────────────────────────────────────
export const events = pgTable('events', {
  id:           uuid('id').primaryKey().defaultRandom(),
  store_id:     uuid('store_id').notNull().references(() => stores.id),
  title:        varchar('title', { length: 100 }),
  type:         eventTypeEnum('type').notNull(),
  image_url:    text('image_url'),
  ticker_text:  text('ticker_text'),
  start_at:     timestamp('start_at'),
  end_at:       timestamp('end_at'),
  recurrence:   jsonb('recurrence'),
  cta_url:      text('cta_url'),                    // M03 Sprint B — QR target (reservation/SNS link)
  active:       boolean('active').default(false),
  created_at:   timestamp('created_at').defaultNow(),
});

// ── venue_groups ──────────────────────────────────────────────────────────────
export const venue_groups = pgTable('venue_groups', {
  id:             uuid('id').primaryKey().defaultRandom(),
  name:           varchar('name', { length: 80 }).notNull(),
  code:           varchar('code', { length: 20 }).unique().notNull(),
  footer_message: text('footer_message'),
});

// ── venue_group_members ───────────────────────────────────────────────────────
export const venue_group_members = pgTable('venue_group_members', {
  id:             uuid('id').primaryKey().defaultRandom(),
  store_id:       uuid('store_id').notNull().references(() => stores.id),
  venue_group_id: uuid('venue_group_id').notNull().references(() => venue_groups.id),
  label:          varchar('label', { length: 40 }),
  color_hex:      varchar('color_hex', { length: 7 }),
  display_order:  integer('display_order').default(0),
});

// ── tv_content_profiles ───────────────────────────────────────────────────────
export const tvProfileTypeEnum = pgEnum('tv_profile_type', ['menu', 'pickup', 'event']);
export const pickupModeEnum    = pgEnum('pickup_mode',     ['single', 'multi_venue']);

export const tv_content_profiles = pgTable('tv_content_profiles', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  store_id:           uuid('store_id').notNull().references(() => stores.id),
  profile_name:       varchar('profile_name', { length: 80 }).notNull(),
  profile_type:       tvProfileTypeEnum('profile_type').notNull(),
  menu_category_ids:  uuid('menu_category_ids').array(),
  daypart_rules:      jsonb('daypart_rules'),
  pickup_mode:        pickupModeEnum('pickup_mode'),
  tts_enabled:        boolean('tts_enabled').default(false),
  event_group_id:     uuid('event_group_id'),
  slide_interval_sec: integer('slide_interval_sec').default(10),
});

// ── tv_instances ──────────────────────────────────────────────────────────────
export const tvFunctionTypeEnum = pgEnum('tv_function_type', ['menu', 'pickup', 'event', 'ad']);

export const tv_instances = pgTable('tv_instances', {
  id:            uuid('id').primaryKey().defaultRandom(),
  store_id:      uuid('store_id').notNull().references(() => stores.id),
  display_name:  varchar('display_name', { length: 80 }),
  function_type: tvFunctionTypeEnum('function_type').notNull(),
  profile_id:    uuid('profile_id').references(() => tv_content_profiles.id),
  ip_address:    varchar('ip_address', { length: 45 }),
  is_active:     boolean('is_active').default(true),
  last_ping_at:  timestamp('last_ping_at'),
  sort_order:    integer('sort_order').default(0),
});

// ── tv_pairing_requests ───────────────────────────────────────────────────────
// AG-008 extended to tv_instances. A TV without saved credentials hits POST
// /api/tv-instances/pair-request which inserts a row here with a 6-char code
// (10 min expiry). Staff on tablet enters the code via /pair-claim, which
// creates the actual tv_instances row under the staff's store_id and links it
// back here. TV polls /pair-status?code=X every 2s; on claim it gets the new
// instance id + saves credentials, no manual UUID entry needed.
export const tv_pairing_requests = pgTable('tv_pairing_requests', {
  pairing_code:   varchar('pairing_code',   { length: 6 }).primaryKey(),
  device_id:      varchar('device_id',     { length: 128 }).notNull(),
  expires_at:     timestamp('expires_at').notNull(),
  created_at:     timestamp('created_at').notNull().defaultNow(),
  claimed_at:     timestamp('claimed_at'),
  tv_instance_id: uuid('tv_instance_id').references(() => tv_instances.id, { onDelete: 'set null' }),
}, (t) => ({
  // Partial index for cron cleanup of expired unclaimed entries.
  pending_expires_idx: index('tv_pairing_requests_pending_expires_idx').on(t.expires_at).where(sql`${t.claimed_at} IS NULL`),
}));

// ── store_settings ────────────────────────────────────────────────────────────
// Spec §10. One row per store. Shape mirrors packages/shared/src/storeSettings.ts.
// Zod validation lives in apps/api/src/routes/storeSettings.ts.
export const store_settings = pgTable('store_settings', {
  store_id:   uuid('store_id').primaryKey().references(() => stores.id, { onDelete: 'cascade' }),
  config:     jsonb('config').notNull().default({}),
  updated_at: timestamp('updated_at').defaultNow(),
});

// ── order_state_transitions ───────────────────────────────────────────────────
// Audit log for analytics + AI training. Written in same tx as orders.status PATCH.
// Spec §15.2.
export const order_state_transitions = pgTable('order_state_transitions', {
  id:          uuid('id').primaryKey().defaultRandom(),
  store_id:    uuid('store_id').notNull().references(() => stores.id),
  order_id:    uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  from_status: orderStatusEnum('from_status'),
  to_status:   orderStatusEnum('to_status').notNull(),
  actor:       varchar('actor', { length: 16 }).notNull(),     // 'system' | 'staff' | 'webhook'
  actor_id:    uuid('actor_id'),                                // users.id when actor='staff'
  reason:      varchar('reason', { length: 60 }),               // e.g. reject reason, remake reason
  ts:          timestamp('ts').defaultNow().notNull(),
}, (t) => ({
  storeTsIdx:      index('ost_store_ts_idx').on(t.store_id, t.ts),
  storeOrderTsIdx: index('ost_store_order_ts_idx').on(t.store_id, t.order_id, t.ts),
}));

// ── promotions ────────────────────────────────────────────────────────────────
export const promotions = pgTable('promotions', {
  id:               uuid('id').primaryKey().defaultRandom(),
  store_id:         uuid('store_id').notNull().references(() => stores.id),
  title:            varchar('title', { length: 100 }).notNull(),
  discount_rate:    decimal('discount_rate', { precision: 5, scale: 2 }),
  banner_text:      text('banner_text'),
  countdown_end_at: timestamp('countdown_end_at'),
  is_active:        boolean('is_active').default(false),
});
