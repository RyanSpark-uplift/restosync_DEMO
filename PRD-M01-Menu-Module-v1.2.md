# RestoSync — Menu Module (M01) PRD — v1.2

> **Version:** 1.2 (Menu Import 5-paths + Phased Dev Guide) · **Date:** 2026-05-17
> **Owner:** Ryan · VP Product Engineering
> **Status:** Ready for engineering review
> **Changes from v1.1:** Menu Import 시스템 (Section 18, 5 paths — Excel/AI OCR/Web Scrape/POS/Manual) + 단계별 개발 가이드 (Section 19, Phase 1 MVP 12주 Sprint Plan) + Subagent 할당 매트릭스 + 신규 차별화 D9 (Multi-Path Onboarding)
> **v1.1 변경 유지:** 7 workflow gaps closed (Modifiers, Combos, Recipe link, POS sync source, Tax/Tip, Featured logic, Analytics fields) + 4 differentiators (D5~D8)

---

## 0. Quick Summary (Direct Answer)

RestoSync Menu Module은 태블릿 앱에서 메뉴를 관리하고 Android TV에 실시간 표시하는 모듈이다. 기존 Pickup(M02) 모듈과 동일한 API 서버, WebSocket, DB 인프라 공유.

**v1.1의 핵심 변경:**

1. **Modifiers/Variants 추가** — Small/Medium/Large, 추가 소스, 매운 정도 등 옵션 처리
2. **Combo/Bundle 추가** — 객단가 +35% 효과 (NoviSign·Toast 표준)
3. **Recipe-Ingredient 연결** — 재료 재고 → 메뉴 자동 86 (WISK 별도 $99/mo 통합)
4. **POS Sync Source 명시** — Phase 2 POS 연동 시 데이터 출처 추적
5. **Tax/Tip 표시 정책** — 매장별 세금 포함/별도 옵션
6. **Featured Banner 로직** — 자동 로테이션 알고리즘
7. **Menu Engineering Analytics** — Stars/Plow Horses/Puzzles/Dogs 데이터 수집

**4개 신규 차별화 (경쟁사 조사 기반):**
- D5: Recipe-Linked Auto 86
- D6: Menu Engineering Matrix 내장
- D7: Multi-Restaurant Food Court Mode
- D8: Open POS Adapter (Phase 2~3)

---

## 1. 경쟁 분석 업데이트 (2026-05 조사)

### 1.1 신규 위협 (Threats)

| 경쟁사 | 신규 기능 / 변화 | 영향 |
|---|---|---|
| **Toast IQ Spring 2026** | AI 메뉴 페어링 추천 + AI 어시스턴트 (한·중·스페인어) | ⚠️ 우리 다국어 차별화 일부 잠식. Toast 사용자만 대상이므로 **비-Toast 진입로는 여전히 유효** |
| **Chowbus POS** (Korean/Asian BBQ·Hot Pot) | AYCE 타이머, 90분 한도, QR ordering, 한·중·영 다국어, KBBQ 특화 | ⚠️ **한식 시장 직접 경쟁** — 우리는 메뉴보드 +픽업 통합으로 차별화 |
| **MenuSifu** | $0 upfront grant + KPop Korean BBQ 등 한식 체인 점유 | ⚠️ 한식 시장 이미 점유 — 비-POS 사이니지 시장 우선 |
| **OptiSync (OptiSigns)** | Universal POS API 어댑터 — 동적 메뉴 직접 연동 | 참고: 우리도 D8 Open POS Adapter 필요 |
| **Yodeck + Lenny's Grill** | 900+ 매장, POS-driven smart boards로 주 $4-5K 매출 증대 입증 | 시장 검증 사례 — 우리 Phase 3 다지점 기능 정당화 |

### 1.2 SMB 시장 가격 (검증된 2026 가격)

| 솔루션 | 가격 (per screen/mo) | 시장 포지션 |
|---|---|---|
| Yodeck Basic | $8 (1개 무료) | 진입 |
| OptiSigns Standard | $10 | 가성비 |
| OptiSigns Pro | $16 | 멀티존 |
| **RestoSync Starter** | **$9** | ★ 우리 진입 |
| **RestoSync Pro** | **$19** | ★ 메인 |
| Toast Menu (KDS 포함) | POS $69+/mo + 사이니지 | 상위 |
| Square KDS | $20/screen + Square POS | 중상위 |
| Raydiant | $49+ + 하드웨어 $169 | 엔터프라이즈 |
| **RestoSync Business** | **$39** | ★ 다지점 |

### 1.3 차별화 매트릭스 v1.1

| 기능 | Toast | Square | Chowbus | OptiSigns | Yodeck | **RestoSync M01** |
|------|-------|--------|---------|-----------|--------|---|
| 가격 / screen | POS+사이니지 | $20+POS | POS 번들 | $10~$16 | $8 | **$9~$39** |
| POS lock-in | ★ Toast | ★ Square | ★ Chowbus | ✗ | ✗ | **✗ 자유** |
| Multi-zone (Menu+Pickup) | ✗ | ✗ | ✗ | △ | ✗ | **★ 핵심** |
| 6-Daypart | 3 | 일반 | △ | ✓ | ✓ | **6** |
| 다국어 (한/중/일) | EN+AI(2026) | EN | 한·중·영 | △ | △ | **EN/KO/ES/ZH/JA** |
| Modifiers/Variants | ✓ | ✓ | ✓ | △ | △ | **✓ v1.1 추가** |
| Combo/Bundle | ✓ | ✓ | ✓ | △ | △ | **✓ v1.1 추가** |
| **Recipe-linked Auto 86 ★D5** | △ (재고 별도) | △ | △ | ✗ | ✗ | **★ v1.1 통합 차별화** |
| **Menu Engineering Matrix ★D6** | ✓ (보고서) | △ | △ | ✗ | ✗ | **★ 대시보드 내장** |
| **Multi-Restaurant FoodCourt ★D7** | ✗ | ✗ | ✗ | ✗ | ✗ | **★ v1.1 차별화** |
| **Open POS Adapter ★D8** | ✗ | ✗ | ✗ | OptiSync | ✗ | **★ Phase 2~3** |
| Offline cache | △ | ✓ | ✓ | ✓ | ✓ | **✓ day-1** |
| 86 → TV 반영 | <3s | <3s | <3s | 미지원 | <5s | **<3s** |
| Audit log | ✓ | ✓ | ✓ | ✗ | ✗ | **✓** |
| Dogfooding | ✗ | ✗ | ✗ | ✗ | ✗ | **★ 자체 매장** |

---

## 2. Goals & Non-Goals (v1.1)

### 2.1 Goals (MVP)

| # | Goal | Success Metric |
|---|------|----------------|
| G1 | 태블릿 메뉴 항목 CRUD | 항목 생성 → TV 반영 < 5초, 99% |
| G2 | 6-Daypart 자동 전환 | 자동 전환 100%, 운영자 개입 0 |
| G3 | 86-ing (품절 토글) | 토글 → TV "Sold Out" < 3초 |
| G4 | 오프라인 fallback | 인터넷 30분 다운 시 메뉴 유지 |
| G5 | 5-Zone 레이아웃 | TV 1대 = Menu + Pickup 동시 |
| G6 | 가격 변경 즉시 push | 모든 TV < 5초 |
| G7 | 이미지/영상 4K | 5MB, 자동 트랜스코딩 |
| **G8 (NEW)** | **Modifiers/Variants** | Small/Med/Large + 옵션 그룹 |
| **G9 (NEW)** | **Combo/Bundle** | 묶음 가격 + 구성 항목 표시 |
| **G10 (NEW)** | **Featured Banner 자동 로테이션** | 8초 회전 + 우선순위 알고리즘 |

### 2.2 Phase 1.5~2 신규 Goals

| # | Goal | Phase |
|---|------|-------|
| G11 | **Recipe-Linked Auto 86 (D5)** — 재료 재고 → 자동 86 | Phase 1.5 |
| G12 | **Menu Engineering Analytics (D6)** — 데이터 수집 + 대시보드 | Phase 2 |
| G13 | **Multi-Restaurant FoodCourt Mode (D7)** | Phase 2 |
| G14 | **Open POS Adapter (D8)** — Square 우선, Toast/Clover 차후 | Phase 2~3 |

### 2.3 Non-Goals (MVP 제외)

- POS 자동 동기화 (양방향) — Phase 2 (G14)
- 다지점 통합 dashboard — Phase 3
- AI 메뉴 추천 / 동적 가격 — Phase 3
- 드라이브스루 야외 디스플레이 — 별도 모듈
- QR 코드 주문 결제 — 별도 모듈
- 키오스크 / 셀프오더 — 별도 모듈

---

## 3. User Stories (v1.1 추가분)

### 3.1 Owner / Manager (v1.1 추가)

| ID | Story | Priority |
|----|-------|----------|
| US-14 (NEW) | Spicy Wings를 Small($8) / Medium($11) / Large($15) 세 사이즈로 표시 | P0 |
| US-15 (NEW) | "Chicken + Fries + Drink Combo $11.99" 묶음 메뉴 등록 | P0 |
| US-16 (NEW) | 추가 소스 / 토핑을 +$0.50 옵션으로 표시 | P1 |
| US-17 (NEW) | 닭다리 재고 0개 시 Chicken 자동 86 (Phase 1.5) | P0 (P1.5) |
| US-18 (NEW) | 어떤 메뉴가 Star/Puzzle/Dog인지 대시보드에서 한눈에 (Phase 2) | P0 (P2) |
| US-19 (NEW) | 푸드코트 매장 — TV 1대에 우리 매장 + 옆 매장 메뉴 분할 표시 (Phase 2) | P1 (P2) |
| US-20 (NEW) | Featured Banner에 어떤 항목이 언제 나올지 규칙 설정 | P1 |

---

## 4. Pages (v1.1 — 신규 페이지 + 기존 페이지 확장)

### 4.1 Page B (Item Edit) — **Tab 추가**

**기존 4탭 → 6탭 확장:**

| Tab | 기존/신규 | 내용 |
|---|---|---|
| ① Basic | 기존 | Name, Description, Category, Price, Photo |
| ② Schedule | 기존 | Daypart, LTO 기간 |
| ③ Allergens | 기존 | 알레르겐, 칼로리, Spice level |
| ④ Display | 기존 | TV 표시, Sort order, Featured |
| **⑤ Modifiers / Variants (NEW)** | **v1.1** | Size variants + Modifier groups |
| **⑥ Ingredients (NEW, Phase 1.5)** | **v1.1** | 재료 매핑 → 재고 연결 |

#### Tab 5: Modifiers / Variants 상세

**Size Variants (item 자체의 가격 변형):**
- 토글: ☐ This item has multiple sizes
- Variant rows: [Size name] [+/- price] [SKU] [정렬]
- Example: Small ($0), Medium (+$3), Large (+$6)
- 각 variant는 독립 86 가능

**Modifier Groups (옵션 그룹):**
- 그룹 추가: [Group name] [Required ☐] [Min select N] [Max select M]
- 그룹 내 옵션: [Name] [+/- price]
- Example:
  - "Sauce" (optional, min 0, max 3) — Ranch (+$0.50), BBQ (+$0.50), Buffalo (+$0.50)
  - "Spice Level" (required, exactly 1) — Mild, Medium, Hot, Extra Hot
- TV에는 기본 가격만 표시 (옵션은 키오스크/주문 화면에 노출)

#### Tab 6: Ingredients (Phase 1.5)

- 재료 매핑: 메뉴 1개당 N개 재료 (N:M 관계)
- 단위 + 수량: "Chicken thigh × 200g", "Rice × 150g"
- 자동 차감 토글: ☐ Auto-deduct on order (주문 시 재고 차감)
- 자동 86 임계값: "재고 < 5인분일 때 자동 sold_out"

### 4.2 신규 페이지

#### Page G: `/menu/combos` (NEW v1.1)

콤보·번들 전용 관리:
- 콤보 이름 + 구성 항목 선택 (드래그)
- 정가 vs 콤보가 자동 계산 (할인율 표시)
- 옵션 단계: "Choose 1 main + 1 side + 1 drink"
- TV 표시 옵션: 콤보 전용 카드 / Featured Banner 노출

#### Page H: `/menu/analytics` (NEW, Phase 2)

Menu Engineering Matrix 자동:
- 2x2 매트릭스 (X: 인기도, Y: 마진)
- 항목별 Star / Plow Horse / Puzzle / Dog 분류
- 시간 필터 (지난 4주 / 8주 / 3개월)
- 카테고리·데이파트별 드릴다운
- 액션 추천: "Spicy Wings는 Puzzle — Featured 노출 권장"

#### Page I: `/menu/ingredients` (NEW, Phase 1.5)

재고-재료 관리:
- 재료 목록 (Chicken thigh, Rice, Apple 등)
- 단위 변환 (g/kg/lb/oz/개)
- 현재 재고 + par level (최소 재고)
- 연결된 메뉴 표시 (역참조)
- 재료 86 → 메뉴 자동 86 시뮬레이션

---

## 5. API Endpoints (v1.1)

### 5.1 신규 엔드포인트

#### Modifiers / Variants

```
GET    /api/menu/items/:id/variants
POST   /api/menu/items/:id/variants
PATCH  /api/menu/items/:id/variants/:variant_id
DELETE /api/menu/items/:id/variants/:variant_id

GET    /api/menu/modifier-groups
POST   /api/menu/modifier-groups
PATCH  /api/menu/modifier-groups/:id
DELETE /api/menu/modifier-groups/:id

POST   /api/menu/items/:id/attach-modifier-group/:group_id
DELETE /api/menu/items/:id/attach-modifier-group/:group_id
```

#### Combos

```
GET    /api/menu/combos
POST   /api/menu/combos
PATCH  /api/menu/combos/:id
DELETE /api/menu/combos/:id
```

#### Ingredients (Phase 1.5)

```
GET    /api/menu/ingredients
POST   /api/menu/ingredients
PATCH  /api/menu/ingredients/:id
PATCH  /api/menu/ingredients/:id/stock-adjust    # 재고 조정
POST   /api/menu/items/:id/recipe                # 메뉴에 재료 매핑
```

#### Analytics (Phase 2)

```
GET    /api/menu/analytics/engineering-matrix    # ?from, ?to, ?category_id
GET    /api/menu/analytics/popularity            # 인기 순위
GET    /api/menu/analytics/margin                # 마진 분석
GET    /api/menu/analytics/featured-recommendations
```

#### Featured Banner Logic (v1.1)

```
GET    /api/menu/featured/current?tv_instance_id=<uuid>   # 현재 노출 항목
PUT    /api/menu/featured/rules                           # 노출 규칙 설정
```

### 5.2 기존 엔드포인트 응답 확장 (v1.1)

#### GET /api/menu/items 응답 추가 필드

```json
{
  "id": "uuid",
  "...": "기존 필드",
  
  "variants": [
    { "id": "uuid", "name": "Small", "price_delta_cents": 0, "sku": "CC-S", "is_sold_out": false },
    { "id": "uuid", "name": "Large", "price_delta_cents": 600, "sku": "CC-L", "is_sold_out": false }
  ],
  
  "modifier_groups": [
    {
      "id": "uuid",
      "name": "Sauce",
      "required": false,
      "min_select": 0,
      "max_select": 3,
      "options": [
        { "id": "uuid", "name": "Ranch", "price_delta_cents": 50 },
        { "id": "uuid", "name": "BBQ", "price_delta_cents": 50 }
      ]
    }
  ],
  
  "recipe": [
    { "ingredient_id": "uuid", "name": "Chicken thigh", "quantity": 200, "unit": "g" }
  ],
  
  "tax_policy": "exclusive",        // exclusive | inclusive | exempt
  "tax_category": "prepared_food",  // 매장 세금 카테고리
  
  "sync_source": "restosync",       // restosync | toast | square | clover | chowbus
  "external_id": null,              // POS 측 ID (sync 시)
  "last_synced_at": null,
  
  "analytics": {
    "sold_count_30d": 142,
    "revenue_cents_30d": 141758,
    "margin_pct": 68.5,
    "menu_engineering_class": "star"   // star | plow_horse | puzzle | dog
  }
}
```

---

## 6. WebSocket Events (v1.1 신규)

| Event | Payload | TV 동작 |
|-------|---------|---------|
| `display:variant_toggled` | `{ item_id, variant_id, is_sold_out }` | 해당 variant만 sold out |
| `display:combo_updated` | `{ combo }` | 콤보 카드 업데이트 |
| `display:ingredient_low` | `{ ingredient_id, affected_items[] }` | (Phase 1.5) 자동 86 트리거 |
| `display:featured_rotation` | `{ item_id, slot }` | Banner Zone B 회전 |
| `tablet:analytics_updated` | `{ matrix_class_changes[] }` | (Phase 2) 대시보드 알림 |

---

## 7. Database Schema (v1.1)

### 7.1 신규 테이블

#### `menu_variants`

```typescript
export const menuVariants = pgTable('menu_variants', {
  id: uuid('id').defaultRandom().primaryKey(),
  itemId: uuid('item_id').notNull().references(() => menuItems.id, { onDelete: 'cascade' }),
  
  name: jsonb('name').notNull().$type<Record<string, string>>(),  // {en, ko, es}
  priceDeltaCents: integer('price_delta_cents').notNull().default(0),
  sku: text('sku'),
  isSoldOut: boolean('is_sold_out').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (t) => ({
  itemIdx: index('idx_variants_item').on(t.itemId, t.sortOrder),
}));
```

#### `menu_modifier_groups`

```typescript
export const menuModifierGroups = pgTable('menu_modifier_groups', {
  id: uuid('id').defaultRandom().primaryKey(),
  storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  
  name: jsonb('name').notNull().$type<Record<string, string>>(),
  required: boolean('required').notNull().default(false),
  minSelect: integer('min_select').notNull().default(0),
  maxSelect: integer('max_select').notNull().default(1),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

#### `menu_modifier_options`

```typescript
export const menuModifierOptions = pgTable('menu_modifier_options', {
  id: uuid('id').defaultRandom().primaryKey(),
  groupId: uuid('group_id').notNull().references(() => menuModifierGroups.id, { onDelete: 'cascade' }),
  
  name: jsonb('name').notNull().$type<Record<string, string>>(),
  priceDeltaCents: integer('price_delta_cents').notNull().default(0),
  isSoldOut: boolean('is_sold_out').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
});
```

#### `menu_item_modifier_groups` (M:N 매핑)

```typescript
export const menuItemModifierGroups = pgTable('menu_item_modifier_groups', {
  itemId: uuid('item_id').notNull().references(() => menuItems.id, { onDelete: 'cascade' }),
  groupId: uuid('group_id').notNull().references(() => menuModifierGroups.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull().default(0),
}, (t) => ({
  pk: primaryKey({ columns: [t.itemId, t.groupId] }),
}));
```

#### `menu_combos`

```typescript
export const menuCombos = pgTable('menu_combos', {
  id: uuid('id').defaultRandom().primaryKey(),
  storeId: uuid('store_id').notNull().references(() => stores.id),
  
  name: jsonb('name').notNull().$type<Record<string, string>>(),
  description: jsonb('description'),
  photoUrl: text('photo_url'),
  
  priceCents: integer('price_cents').notNull(),         // 콤보 가격
  itemsTotalCents: integer('items_total_cents'),        // 정가 합계 (참조용)
  savingsCents: integer('savings_cents'),               // 할인액
  
  dayparts: text('dayparts').array().notNull(),
  isSoldOut: boolean('is_sold_out').notNull().default(false),
  isFeatured: boolean('is_featured').notNull().default(false),
  showOnTv: boolean('show_on_tv').notNull().default(true),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
});
```

#### `menu_combo_items` (콤보 구성)

```typescript
export const menuComboItems = pgTable('menu_combo_items', {
  comboId: uuid('combo_id').notNull().references(() => menuCombos.id, { onDelete: 'cascade' }),
  itemId: uuid('item_id').notNull().references(() => menuItems.id),
  quantity: integer('quantity').notNull().default(1),
  isSubstitutable: boolean('is_substitutable').notNull().default(false),  // "Choose 1 of these"
  groupName: text('group_name'),  // "Main" | "Side" | "Drink"
  sortOrder: integer('sort_order').notNull().default(0),
}, (t) => ({
  pk: primaryKey({ columns: [t.comboId, t.itemId] }),
}));
```

#### `menu_ingredients` (Phase 1.5)

```typescript
export const menuIngredients = pgTable('menu_ingredients', {
  id: uuid('id').defaultRandom().primaryKey(),
  storeId: uuid('store_id').notNull().references(() => stores.id),
  
  name: jsonb('name').notNull().$type<Record<string, string>>(),
  unit: text('unit').notNull(),                          // 'g', 'kg', 'lb', 'oz', 'piece'
  currentStock: numeric('current_stock', { precision: 12, scale: 3 }).notNull().default('0'),
  parLevel: numeric('par_level', { precision: 12, scale: 3 }).notNull().default('0'),
  reorderLevel: numeric('reorder_level', { precision: 12, scale: 3 }).notNull().default('0'),
  
  costPerUnitCents: integer('cost_per_unit_cents'),     // 재료 단가 (COGS)
  supplierId: uuid('supplier_id'),                       // Phase 2
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

#### `menu_item_ingredients` (레시피)

```typescript
export const menuItemIngredients = pgTable('menu_item_ingredients', {
  itemId: uuid('item_id').notNull().references(() => menuItems.id, { onDelete: 'cascade' }),
  ingredientId: uuid('ingredient_id').notNull().references(() => menuIngredients.id),
  quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
  unit: text('unit').notNull(),                          // 레시피 단위 (자동 변환)
}, (t) => ({
  pk: primaryKey({ columns: [t.itemId, t.ingredientId] }),
  ingredientIdx: index('idx_recipe_ingredient').on(t.ingredientId),  // 역참조용
}));
```

#### `menu_featured_rules` (NEW)

```typescript
export const menuFeaturedRules = pgTable('menu_featured_rules', {
  id: uuid('id').defaultRandom().primaryKey(),
  storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  
  itemId: uuid('item_id').references(() => menuItems.id, { onDelete: 'cascade' }),
  comboId: uuid('combo_id').references(() => menuCombos.id, { onDelete: 'cascade' }),
  
  rotationSlot: integer('rotation_slot').notNull(),     // 0~N, 회전 순서
  durationSec: integer('duration_sec').notNull().default(8),
  
  conditionType: text('condition_type'),                 // 'daypart' | 'low_inventory' | 'chef_pick' | 'lto' | 'always'
  conditionParams: jsonb('condition_params'),            // 조건별 파라미터
  
  priority: integer('priority').notNull().default(0),    // 충돌 시 우선순위
  isActive: boolean('is_active').notNull().default(true),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

#### `menu_item_analytics_cache` (Phase 2)

```typescript
export const menuItemAnalyticsCache = pgTable('menu_item_analytics_cache', {
  itemId: uuid('item_id').notNull().primaryKey().references(() => menuItems.id, { onDelete: 'cascade' }),
  
  periodStart: timestamp('period_start').notNull(),
  periodEnd: timestamp('period_end').notNull(),
  
  soldCount: integer('sold_count').notNull().default(0),
  revenueCents: integer('revenue_cents').notNull().default(0),
  cogsCents: integer('cogs_cents').notNull().default(0),
  marginCents: integer('margin_cents').notNull().default(0),
  marginPct: numeric('margin_pct', { precision: 5, scale: 2 }),
  popularityRank: integer('popularity_rank'),
  
  engineeringClass: text('engineering_class'),    // 'star' | 'plow_horse' | 'puzzle' | 'dog'
  
  computedAt: timestamp('computed_at').defaultNow().notNull(),
});
```

### 7.2 기존 `menu_items` 테이블 추가 컬럼 (v1.1)

```typescript
// 기존 menu_items에 추가:
hasVariants: boolean('has_variants').notNull().default(false),
hasModifiers: boolean('has_modifiers').notNull().default(false),

// Tax policy (v1.1 신규)
taxPolicy: text('tax_policy').notNull().default('exclusive'),  // exclusive | inclusive | exempt
taxCategoryId: uuid('tax_category_id'),  // FK to stores.tax_categories (별도 테이블)

// POS Sync source (v1.1 신규 — Phase 2 준비)
syncSource: text('sync_source').notNull().default('restosync'),  // restosync | toast | square | clover | chowbus
externalId: text('external_id'),                  // POS 측 항목 ID
externalUpdatedAt: timestamp('external_updated_at', { withTimezone: true }),
lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
syncConflictAt: timestamp('sync_conflict_at', { withTimezone: true }),  // 충돌 시각
```

### 7.3 `stores` 추가 컬럼 (v1.1)

```typescript
// 세금 정책
defaultTaxPolicy: text('default_tax_policy').notNull().default('exclusive'),
taxRatePct: numeric('tax_rate_pct', { precision: 5, scale: 3 }).default('7.250'),  // CA 기본

// FoodCourt mode (Phase 2)
isFoodCourtMember: boolean('is_food_court_member').notNull().default(false),
foodCourtId: uuid('food_court_id'),  // FK to food_courts (별도 테이블)
```

### 7.4 신규 테이블 `food_courts` (Phase 2)

```typescript
export const foodCourts = pgTable('food_courts', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  ownerId: uuid('owner_id').references(() => users.id),  // 푸드코트 운영자
  layoutType: text('layout_type').notNull().default('split-4'),  // split-2 | split-4 | grid-3x3
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const foodCourtMembers = pgTable('food_court_members', {
  foodCourtId: uuid('food_court_id').notNull().references(() => foodCourts.id),
  storeId: uuid('store_id').notNull().references(() => stores.id),
  slotIndex: integer('slot_index').notNull(),     // 화면 내 위치
  isActive: boolean('is_active').notNull().default(true),
}, (t) => ({
  pk: primaryKey({ columns: [t.foodCourtId, t.storeId] }),
}));
```

### 7.5 마이그레이션 순서 (v1.1)

```
0010_menu_categories.sql
0011_menu_items_extend_columns.sql
0012_menu_dayparts.sql
0013_menu_audit_log.sql
0014_stores_i18n_columns.sql
0015_menu_partial_indexes.sql
0016_menu_variants.sql                    ← v1.1
0017_menu_modifier_groups.sql             ← v1.1
0018_menu_modifier_options.sql            ← v1.1
0019_menu_item_modifier_groups.sql        ← v1.1
0020_menu_combos.sql                      ← v1.1
0021_menu_combo_items.sql                 ← v1.1
0022_menu_items_tax_sync_columns.sql      ← v1.1
0023_stores_tax_columns.sql               ← v1.1
0024_menu_featured_rules.sql              ← v1.1
-- Phase 1.5
0025_menu_ingredients.sql
0026_menu_item_ingredients.sql
-- Phase 2
0027_menu_item_analytics_cache.sql
0028_food_courts.sql
0029_food_court_members.sql
```

---

## 8. Featured Banner 자동 로테이션 로직 (v1.1 신규)

### 8.1 알고리즘

매분 평가, 매 8초 회전. 풀(pool) → 슬롯 할당 → 순환:

1. **풀 생성** (현재 daypart 활성 항목 중)
   - `is_featured = true` 인 모든 item/combo
   - `menu_featured_rules.condition_type` 매칭되는 동적 항목:
     - `chef_pick` — 사장이 수동 지정
     - `lto` — `available_until - now() < 2일` 인 항목
     - `low_inventory` — 재고 적은 항목 ("Last 5!" 표시)
     - `analytics:star` — Phase 2 자동 추천
     - `analytics:puzzle` — Phase 2 자동 추천
   
2. **우선순위 정렬** (priority desc, then slot asc)

3. **회전 큐** — 8초씩, 풀 크기만큼

4. **충돌 처리** — Multi-zone에서 Pickup이 Featured 위에 우선

### 8.2 매장 운영자 페이지 (Page D 확장)

```
/menu/featured
├── Active Rotation Preview (현재 회전 중인 풀)
├── Rules
│   ├── Always Featured (Chef's Pick) → [추가 항목]
│   ├── LTO 자동 — 마감 임박 시 노출 ☑
│   ├── Low Inventory 자동 — 재고 < N개 시 ☑
│   ├── Daypart 기반 — Lunch에만 Spicy 항목 ☑
│   └── Analytics Auto-Suggest (Phase 2) ☑
└── 회전 간격 (sec) [드롭다운: 5/8/10/12]
```

---

## 9. Tax / Tip 정책 (v1.1 신규)

### 9.1 가격 표시 규칙

| Policy | 의미 | TV 표시 | 캘리포니아 |
|---|---|---|---|
| `exclusive` | 세금 별도 | "$9.99 (+tax)" 또는 "$9.99" | 기본 |
| `inclusive` | 세금 포함 | "$9.99" (tax-incl) | 일부 |
| `exempt` | 면세 (생수, 일부 식료품) | "$9.99" | 식료품점 |

매장 default + 항목별 override.

### 9.2 Tax Categories (별도 테이블, Phase 2)

```typescript
export const taxCategories = pgTable('tax_categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  storeId: uuid('store_id').notNull(),
  name: text('name').notNull(),                    // "Prepared Food", "Cold Beverage"
  taxRatePct: numeric('tax_rate_pct', { precision: 5, scale: 3 }).notNull(),
});
```

캘리포니아 prepared food/cold food/hot food 규칙에 대응.

---

## 10. POS Sync Source 정책 (v1.1 — Phase 2 준비)

### 10.1 sync_source 필드의 의미

| Value | 의미 | 권한 |
|---|---|---|
| `restosync` | RestoSync 자체 (default) | 전체 편집 가능 |
| `toast` | Toast가 master | 우리 UI에서는 read-only + sync 강제 동기화 옵션 |
| `square` | Square가 master | 동일 |
| `clover` | Clover가 master | 동일 |
| `chowbus` | Chowbus가 master | 동일 (Phase 3) |

### 10.2 양방향 sync 규칙

| 시나리오 | 동작 |
|---|---|
| POS에서 가격 변경 | webhook → external_updated_at 갱신 → 우리 DB 업데이트 → WS 브로드캐스트 |
| 우리에서 가격 변경 (sync_source=toast) | **차단** — sync_source가 자체가 아닐 때 PATCH 거부 (403) |
| 우리에서 가격 변경 (sync_source=restosync) | 정상 진행 |
| 충돌 (양쪽 동시 수정) | last-write-wins by external_updated_at vs updated_at, audit log에 conflict 기록 |
| Sync 비활성화 | sync_source를 'restosync'로 변경 → 자체 관리 시작 |

### 10.3 BR-12 명확화 (v1.0 → v1.1)

> BR-12: 가격 변경은 진행 중 주문에 영향 없음. **주문 생성 시점에 `price_cents` + `variants` + `modifiers` 전체 스냅샷을 `orders.line_items_snapshot` JSON에 저장.** POS sync로 가격이 바뀌어도 진행 중 주문은 영향 없음.

---

## 11. Business Rules (v1.1 — 신규 추가)

| ID | Rule | 적용 시점 |
|----|------|----------|
| **BR-16 (NEW)** | Variant 가격은 base item price + price_delta_cents | 가격 계산 |
| **BR-17 (NEW)** | Modifier group의 min_select/max_select 검증 (주문 시 — M02) | 주문 생성 |
| **BR-18 (NEW)** | Combo의 isSubstitutable=true 항목은 같은 group_name 내에서 교체 가능 | UI |
| **BR-19 (NEW)** | 재료 자동 86: stock < (recipe_quantity × 5)일 때 자동 sold_out (Phase 1.5) | 재고 변경 시 |
| **BR-20 (NEW)** | sync_source ≠ 'restosync'인 항목은 우리 API에서 PATCH 거부 | API 미들웨어 |
| **BR-21 (NEW)** | Featured Rotation은 매 분마다 풀 재평가, 매 8초마다 회전 | TV 클라이언트 |
| **BR-22 (NEW)** | Tax policy는 항목 default = 매장 default (jsonb override 가능) | 가격 표시 |
| **BR-23 (NEW)** | Combo 가격은 구성 항목 정가 합계보다 작거나 같아야 함 (검증 422) | combo POST/PATCH |
| **BR-24 (NEW)** | Analytics class 재계산은 매일 03:00 매장 타임존 (BullMQ cron) | 백그라운드 |
| **BR-25 (NEW)** | FoodCourt mode TV는 회원 매장 모두의 메뉴를 slot별로 표시 (Phase 2) | TV 렌더링 |

---

## 12. Performance Targets (v1.1 추가)

| Metric | Target |
|--------|--------|
| Featured rotation 평가 | < 100ms (매 분) |
| Recipe → Auto 86 검증 | < 50ms (재고 변경 webhook 후) |
| Analytics 매트릭스 계산 (1 매장) | < 10초 (매일 03:00 cron) |
| POS webhook → DB 반영 | < 2초 |
| FoodCourt 4-split 렌더 | < 3초 초기 로드 |

---

## 13. Acceptance Criteria (v1.1 추가)

### MVP (Phase 1)

- [ ] 항목당 size variant 5개까지 등록·삭제·86 동작
- [ ] Modifier group 5개 + 옵션 10개까지 등록 가능
- [ ] Combo 등록 → TV에 콤보 카드 + 정가 vs 콤보가 표시
- [ ] Featured Banner 자동 회전 8초 간격 동작
- [ ] Tax policy exclusive/inclusive 표시 차이 동작
- [ ] sync_source != 'restosync' 항목 편집 시 403 반환

### Phase 1.5

- [ ] 재료 등록 → 메뉴 매핑 (N:M) 동작
- [ ] 재료 재고 0 → 연결된 모든 메뉴 자동 86
- [ ] Page I (재료 페이지) CRUD 동작

### Phase 2

- [ ] Analytics 대시보드 4사분면 매트릭스 표시
- [ ] FoodCourt 2/4-split 모드 TV 렌더링
- [ ] Square Webhook → 자동 sync

---

## 14. Phase 로드맵 (v1.1 갱신)

| Phase | 기간 | Menu 기능 | 파일럿 |
|-------|------|-----------|----------|
| **Phase 1 (MVP)** | +1~+3개월 | G1-G10, M1-M6, M12, 다국어(en/ko/es), audit, **Variants, Combos, Featured rotation, Tax policy** | 본인 매장 1곳 |
| **Phase 1.5** | +3~+4개월 | Multi-zone (Menu+Pickup), bulk actions, CSV import/export, **Recipe + Auto 86 (D5/G11)** | 본인 + 베타 2곳 |
| **Phase 2** | +4~+6개월 | 알레르기/칼로리, **Square POS Adapter (D8/G14)**, **Menu Engineering Analytics (D6/G12)**, **FoodCourt Mode (D7/G13)** | 베타 5곳 (한식 매장 우선) |
| **Phase 3** | +6~+9개월 | 다지점 dashboard, Toast/Clover/Chowbus Adapter (D8 확장), 템플릿 라이브러리 50+ | 페이드 10~20곳 |
| **Phase 4** | +9~+12개월 | 분석 강화, AI 추천 (Phase 2 매트릭스 기반), A/B 테스트 | 유료 GA |

---

## 15. Risks & Mitigations (v1.1 추가)

| Risk | 영향 | 가능성 | 완화 |
|---|---|---|---|
| **Toast IQ AI가 다국어 + 한식 메뉴까지 점유** | 큼 | 중 | 비-Toast 매장 + Open POS Adapter로 차별화. Toast 사용자는 어차피 우리 타겟 외 |
| **Chowbus/MenuSifu가 메뉴보드까지 확장** | 매우 큼 | 중 | 우리 진입 시점 가속화 — 6개월 내 베타 5곳 확보 필수 |
| Modifier/Variant 복잡도가 UI 사용성 저하 | 큼 | 높음 | 진보적 disclosure — 기본은 simple, 옵션 토글 시 노출 |
| Recipe-Ingredient (Phase 1.5) 데이터 입력 부담 | 큼 | 높음 | CSV import + 자동 매칭 + 옵션 (사용 안 해도 메뉴는 동작) |
| Analytics class 잘못된 추천 | 중 | 중 | Manual override + "이유 표시" (예: "Sold 142, margin 68%, ranks #3") |
| FoodCourt 데이터 격리 실패 | 매우 큼 | 중 | 매장당 store_id 강제 필터 + 별도 인증 토큰 |
| POS sync 충돌 | 큼 | 높음 | sync_conflict_at 필드 + 명시적 충돌 대시보드 |

---

## 16. Open Questions v1.1

| # | Question | 추천 |
|---|----------|------|
| Q1 | (v1.0) 다국어 default 매장별 변경? | 매장별 |
| Q2 | (v1.0) S3 vs R2? | R2 |
| Q3 | (v1.0) TV snapshot TTL? | 60s + WS invalidation |
| Q4 | (v1.0) 가격 변경 중 주문 적용? | 미적용 (snapshot) |
| Q5 | (v1.0) 사진 없음 fallback? | 카테고리 일러스트 |
| Q6 | (v1.0) LTO 종료 자동화? | TV 매분 + 서버 매시 |
| Q7 | (v1.0) 카테고리 삭제? | 차단 + 옵션 이동 |
| Q8 | (v1.0) 자동 번역 API? | Phase 2 이후 |
| **Q9 (NEW)** | Modifier 옵션은 TV에 표시 vs 키오스크/주문만? | TV는 base만, 옵션은 키오스크 (UI 복잡도 회피) |
| **Q10 (NEW)** | Combo는 별도 카드 vs 항목과 혼재? | 별도 카드 + Featured Banner 노출 |
| **Q11 (NEW)** | Recipe 단위 변환은 자동 vs 수동? | 자동 (g↔kg, oz↔lb), 단 piece는 별도 |
| **Q12 (NEW)** | Analytics 기간 default? | 지난 30일 |
| **Q13 (NEW)** | FoodCourt 매장 간 가격 노출 정책? | 각 매장 자체 결정 (옵트인) |
| **Q14 (NEW)** | POS conflict 시 누가 master? | external_updated_at 더 최근 + 운영자 알림 |
| **Q15 (NEW)** | Variant도 별도 photo? | 옵션 (default는 base item photo 상속) |

---

## 17. Engineering Handoff (v1.1)

### 17.1 구현 우선순위 (v1.1 변경)

1. **(P1)** 본인 매장 Pickup 90→100% (변경 없음)
2. **(P1)** DB 마이그레이션 0010~0024 (변경: 0016~0024 신규)
3. **(P1)** API: menu items + variants + modifiers + combos + featured rules
4. **(P1)** Tablet: Page A~D + Page G (Combos) + Page B 6탭 확장
5. **(P1)** TV: 5-Zone + Featured rotation + variant sold-out 오버레이
6. **(P1.5)** Recipe + Ingredients (D5)
7. **(P2)** Analytics + Square Adapter (D6, D8 시작)
8. **(P2)** FoodCourt Mode (D7)

### 17.2 의사결정 즉시 필요

- Q9: Modifier TV 표시 정책 (개발 시작 전 확정)
- Q14: POS conflict master 정책 (Phase 2 진입 전)
- Q15: Variant 사진 정책 (UI 작업 시작 전)

---

**End of PRD-M01 v1.1**
---

# v1.2 추가 사항 — Menu Import System + 단계별 개발 가이드

> **이 섹션은 v1.1에 추가되는 보강 내용입니다. Section 18~22로 번호 부여.**

---

## 18. Menu Import 시스템 — POS 미사용 매장 진입로

### 18.1 진입로 비교 (경쟁사 조사, 2026-05)

POS 미사용 매장이 메뉴 100~200개를 손으로 입력하는 건 비현실적. 온보딩 첫날 포기 사유 1순위. 따라서 **5가지 진입로** 제공.

| 진입로 | RestoSync | Toast | Square | Lightspeed K | Clover | OptiSigns | Yodeck |
|---|---|---|---|---|---|---|---|
| **Excel/CSV Bulk** | ✅ 표준 템플릿 | ✅ 3 templates | ✅ 자체 형식 | ✅ CSV/XLSX | ✅ Excel | ✗ | ✗ |
| **AI Photo/PDF OCR** | ✅ Phase 1.5 | ✗ | ✗ | ✅ AI menu scan | ✗ | ✗ | ✗ |
| **Web Scrape** | ✅ Phase 2 | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **POS Export 변환** | ✅ Phase 2 | N/A | N/A | △ | △ | △ OptiSync | ✗ |
| **Manual CRUD** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **진입로 개수** | **5** | 2 | 2 | 3 | 2 | 2 | 1 |

**경쟁사 인사이트:**

- **Toast Bulk Import** — 3종 템플릿 (Basic / Item Update / Advanced), Google Sheets 기반, `operation ID` 컬럼으로 부모-자식 계층 표현. 단, **Toast 사용자만** (Restaurant Management Essentials 패키지 필수)
- **Square Bulk Import** — Item Name + Variation Name + Description + SKU 필수, Tax 컬럼은 `Tax - Sales (7%)` 형식, modifier는 별도 import 불가, SKU 선행 0 자동 변환 경고
- **Lightspeed K-Series** — PDF/PNG/JPG/HTML/CSV/TXT 지원, **AI menu scan 내장** (사진/PDF → 자동 구조화), Modifier strategy (Shared/Separate) 선택
- **Lightspeed O-Series** — CSV 표준, 450 rows 분할 권장, 1/0 토글, Product ID 수정 금지, **Variants/Option Sets bulk import 불가** (큰 약점)
- **Clover** — MS Excel API 기반, modifier/category 별도 endpoint
- **OptiSigns / Yodeck** — **메뉴 일괄 import 없음**, 슬라이드 단위 콘텐츠 디스플레이만

**D9 차별화 — Multi-Path Onboarding:** 5개 진입로 모두 지원. 종이 메뉴 → 디지털 전환 3시간 → 15분 (Inputly·Veryfi 검증, 95%+ 정확도).

---

### 18.2 Path 1 — Excel/CSV 일괄 업로드 (★ MVP 핵심)

#### 18.2.1 단일 파일 다중 시트 (5-sheet) 구조

경쟁사 분석 후 채택. Toast의 3-template 분리는 사용자 혼동 발생, Square의 평면 CSV는 modifier 표현 불가. **시트별 역할 분리 + external_id 참조**가 최적.

| 시트 | 목적 | 필수 | Phase |
|---|---|---|---|
| **1. ITEMS** | 메뉴 항목 메인 정보 | ★ 필수 | P1 |
| **2. CATEGORIES** | 카테고리 정의 + 순서 | ★ 필수 | P1 |
| **3. MODIFIERS** | 옵션 그룹 + 옵션 | 옵션 | P1 |
| **4. COMBOS** | 콤보/번들 구성 | 옵션 | P1 |
| **5. INGREDIENTS** | 재료 마스터 + 항목별 사용량 (D5) | 옵션 | P1.5 |

추가로 **6. README** 시트 (사용법, 컬럼 설명, enum 값) 포함. **7. _ENUMS** 숨김 시트로 데이터 유효성 검사 드롭다운 제공 (DAYPART, ALLERGEN, SPICE_LEVEL).

#### 18.2.2 Sheet 1 — ITEMS 컬럼

| 컬럼 | 필수 | Type | 예시 | Notes |
|---|---|---|---|---|
| `external_id` | ★ | string | `ITM-001` | 사용자 정의 키. 재import 매칭용 (Toast operation_id 패턴) |
| `name_en` | ★ | string | `demo-store-a` | 영문 (default_language fallback) |
| `name_ko` | 옵션 | string | `크리스피 치킨` | 한글 |
| `name_es` | 옵션 | string | `Pollo Crujiente` | 스페인어 |
| `name_zh` | 옵션 | string | `脆皮鸡` | 중국어 |
| `name_ja` | 옵션 | string | `クリスピーチキン` | 일본어 |
| `description_en` | 옵션 | string | `Hand-breaded demo-store-a...` | ≤500자 |
| `description_ko` | 옵션 | string | | |
| `description_es` | 옵션 | string | | |
| `category_external_id` | ★ | string | `CAT-CHICKEN` | CATEGORIES 시트 참조 |
| `price` | ★ | decimal | `9.99` | 달러 단위 입력 (서버에서 cents 변환 — BR-01 위반 아님, UI 편의) |
| `currency` | 옵션 | string | `USD` | default `USD` |
| `dayparts` | 옵션 | string | `lunch,dinner` | 콤마 구분 (always 가능) |
| `available_from` | 옵션 | date | `2026-06-01` | LTO 시작 |
| `available_until` | 옵션 | date | `2026-06-30` | LTO 종료 |
| `allergens` | 옵션 | string | `wheat,soy` | 콤마 구분, FDA 9대 |
| `calories` | 옵션 | int | `650` | kcal |
| `spice_level` | 옵션 | enum | `medium` | none/mild/medium/hot/extreme |
| `modifier_group_ids` | 옵션 | string | `MOD-SIZE,MOD-SAUCE` | MODIFIERS 시트 참조, 콤마 구분 |
| `is_featured` | 옵션 | bool | `TRUE` | Featured Banner 후보 |
| `show_on_tv` | 옵션 | bool | `TRUE` | default TRUE |
| `sort_order` | 옵션 | int | `10` | default 0 |
| `photo_url` | 옵션 | URL | `https://...` | 이미 호스팅된 사진. 비어 있으면 Step 4에서 일괄 업로드 |
| `kitchen_name` | 옵션 | string | `Cr.Chicken` | KDS 표시용 짧은 이름 (Toast 패턴) |

**입력 규칙:**
- 모든 값 trim, 빈 셀은 NULL
- `price`는 달러 입력 ($9.99) — 서버 검증 후 999 (cents)로 변환
- `bool`은 `TRUE/FALSE` 또는 `1/0` 모두 허용 (Lightspeed 호환)
- `dayparts` 빈 값 = `lunch,dinner` 자동 입력 (default)
- `external_id` 중복 → 같은 import 내에서 에러, 다른 import 간이면 update

#### 18.2.3 Sheet 2 — CATEGORIES

| 컬럼 | 필수 | Type | 예시 |
|---|---|---|---|
| `external_id` | ★ | string | `CAT-CHICKEN` |
| `name_en` | ★ | string | `Chicken` |
| `name_ko` | 옵션 | string | `치킨` |
| `name_es` | 옵션 | string | `Pollo` |
| `name_zh` | 옵션 | string | `鸡肉` |
| `name_ja` | 옵션 | string | `チキン` |
| `icon` | 옵션 | emoji | `🍗` |
| `sort_order` | 옵션 | int | `1` |
| `is_active` | 옵션 | bool | `TRUE` |

#### 18.2.4 Sheet 3 — MODIFIERS

Modifier Group과 Option을 한 시트에 표현. `parent_group_external_id`로 부모-자식 표현 (Toast operation_id 패턴 차용).

| 컬럼 | 필수 | Type | 예시 | Notes |
|---|---|---|---|---|
| `external_id` | ★ | string | `MOD-SIZE` 또는 `OPT-SIZE-L` | 그룹 또는 옵션 ID |
| `row_type` | ★ | enum | `group` 또는 `option` | |
| `parent_group_external_id` | 조건 | string | `MOD-SIZE` | option일 때 필수 |
| `name_en` | ★ | string | `Size` 또는 `Large` | |
| `name_ko` | 옵션 | string | `사이즈` / `대` | |
| `name_es` | 옵션 | string | | |
| `selection_type` | group only | enum | `single` 또는 `multi` | single=라디오, multi=체크박스 |
| `min_select` | group only | int | `0` | default 0 |
| `max_select` | group only | int | `1` | default 1 |
| `is_required` | group only | bool | `TRUE` | |
| `price_delta` | option only | decimal | `2.00` | 추가 금액 (음수 가능) |
| `is_default` | option only | bool | `FALSE` | |
| `sort_order` | 옵션 | int | `1` | |

**예시 (사이즈 그룹):**
```
external_id   | row_type | parent_group_external_id | name_en | selection_type | min/max | price_delta
MOD-SIZE      | group    |                          | Size    | single         | 1 / 1   |
OPT-SIZE-S    | option   | MOD-SIZE                 | Small   |                |         | 0.00
OPT-SIZE-M    | option   | MOD-SIZE                 | Medium  |                |         | 1.50
OPT-SIZE-L    | option   | MOD-SIZE                 | Large   |                |         | 3.00
```

#### 18.2.5 Sheet 4 — COMBOS

| 컬럼 | 필수 | Type | 예시 |
|---|---|---|---|
| `external_id` | ★ | string | `COMBO-CRISPY-LUNCH` |
| `row_type` | ★ | enum | `combo` 또는 `combo_item` |
| `parent_combo_external_id` | 조건 | string | combo_item일 때 필수 |
| `name_en` | ★ | string | `Crispy Lunch Combo` |
| `name_ko` | 옵션 | string | `크리스피 런치 콤보` |
| `combo_price` | combo only | decimal | `12.99` |
| `item_external_id` | combo_item only | string | `ITM-001` (ITEMS 참조) |
| `quantity` | combo_item only | int | `1` |
| `is_swappable` | combo_item only | bool | `FALSE` |
| `swap_category_id` | combo_item only | string | side 카테고리 ID (swappable=TRUE 시) |

#### 18.2.6 Sheet 5 — INGREDIENTS (Phase 1.5)

| 컬럼 | 필수 | Type | 예시 |
|---|---|---|---|
| `external_id` | ★ | string | `ING-CHICKEN-BREAST` |
| `row_type` | ★ | enum | `ingredient` 또는 `item_ingredient` |
| `name_en` | ingredient only | string | `Chicken Breast` |
| `unit` | ingredient only | enum | `oz` / `g` / `each` |
| `current_stock` | ingredient only | decimal | `120.0` |
| `min_threshold` | ingredient only | decimal | `20.0` |
| `item_external_id` | item_ingredient only | string | `ITM-001` (ITEMS 참조) |
| `ingredient_external_id` | item_ingredient only | string | `ING-CHICKEN-BREAST` |
| `quantity_per_serving` | item_ingredient only | decimal | `6.0` |
| `is_critical` | item_ingredient only | bool | `TRUE` (재료 부족 시 메뉴 86) |

---

### 18.3 Excel Import 워크플로우 (8단계)

```
[Step 1] 템플릿 다운로드 (5-sheet XLSX 또는 5개 CSV ZIP)
   ↓
[Step 2] 사용자가 Excel/Google Sheets에서 작성
   ↓
[Step 3] 태블릿/웹에서 업로드 (Drag & Drop, 최대 10MB)
   ↓
[Step 4] 사진 일괄 업로드 (선택)
   - photo_url 비어 있는 항목에 ZIP 또는 폴더로 사진 매칭
   - 파일명을 external_id와 매칭 (예: ITM-001.jpg)
   ↓
[Step 5] 서버 검증 — Zod 스키마 + 도메인 규칙
   - 필수 컬럼 누락
   - external_id 중복
   - 참조 무결성 (category_external_id가 CATEGORIES에 있나)
   - daypart enum 유효성
   - 가격 음수/너무 큰 값
   ↓
[Step 6] 에러 리포트 화면 (Square 패턴)
   - 행별 에러 표시
   - "자동 수정 허용" (대소문자, 빈 값 기본화)
   - 또는 수정 후 재업로드
   ↓
[Step 7] Preview 화면 (Toast Bulk Import 패턴)
   - "100개 항목, 8개 카테고리, 3개 모디파이어 그룹 생성합니다. 확인?"
   - **체크박스 필수**: "I agree this import is NOT reversible"
   ↓
[Step 8] 트랜잭션 실행
   - 전체 DB transaction (all-or-nothing)
   - 진행률 표시
   - 완료 시 audit log 일괄 기록 (operation='bulk_import')
   - WS broadcast `display:menu_full_refresh`
```

**에러 처리 정책 (Toast 학습):** 일부 row 실패 시에도 valid row는 import (partial success), 실패 row는 다운로드 가능한 에러 리포트 제공. 사용자가 옵션 선택: `strict mode` (한 row라도 실패면 전체 rollback) / `lenient mode` (valid만 import).

---

### 18.4 Path 2 — AI Photo/PDF OCR Import (Phase 1.5)

#### 18.4.1 워크플로우

```
[Step 1] 종이 메뉴 사진 / PDF / 스크린샷 업로드 (최대 20MB, 다중 페이지)
   ↓
[Step 2] 서버: 이미지 전처리 (rotation, deskew, contrast — Klippa 패턴)
   ↓
[Step 3] GPT-4o Vision 또는 Claude 3.5 Sonnet API 호출
   - Prompt: "Extract menu structure as JSON with categories, items, prices,
              descriptions, allergens (inferred), spice levels (inferred)"
   - Output: 구조화 JSON (RestoSync 스키마 매핑)
   ↓
[Step 4] Review 화면 (Inputly·Veryfi 패턴)
   - 추출된 항목 편집 가능한 테이블
   - 낮은 신뢰도(<80%)는 노란색 강조
   - 카테고리 자동 분류 확인
   - 한 행씩 승인/수정/삭제
   ↓
[Step 5] 사진 일괄 매칭 (옵션)
   - 원본 이미지에서 메뉴 사진 영역 잘라내기 (vision crop)
   - 또는 별도 사진 업로드
   ↓
[Step 6] Preview & Confirm (18.3 Step 7과 동일)
   ↓
[Step 7] 트랜잭션 실행 (18.3 Step 8과 동일)
```

#### 18.4.2 LLM Prompt 설계

```typescript
const MENU_OCR_SYSTEM_PROMPT = `
You are a restaurant menu digitization assistant. Extract structured data
from menu images. Output STRICT JSON matching this schema:

{
  "categories": [{ "name_en": string, "sort_order": int }],
  "items": [{
    "name_en": string,
    "name_ko"?: string,  // if Korean text visible
    "description_en"?: string,
    "category_name_en": string,  // must match a category
    "price_usd": number,  // dollars, decimal
    "allergens_inferred": string[],  // from description keywords
    "spice_level_inferred": "none"|"mild"|"medium"|"hot"|"extreme",
    "confidence": number  // 0.0~1.0
  }]
}

Rules:
- Output ONLY valid JSON, no markdown
- For prices, normalize to USD decimals (handle $, ¥, ₩)
- Infer allergens from words: "milk/cream"→milk, "egg"→egg, "shrimp/crab"→shellfish
- Spice levels: 🌶️=mild, 🌶️🌶️=medium, 🌶️🌶️🌶️=hot
- If unclear, set confidence < 0.7
- NEVER hallucinate items not in image
`;
```

#### 18.4.3 정확도 목표 & Fallback

- **타겟 정확도**: 95% (Inputly·Veryfi 검증치)
- 신뢰도 < 0.7 항목은 자동 highlight, 사용자 검토 필수
- LLM 실패 (timeout, parse error) → 사용자에게 Excel 템플릿으로 fallback 권유
- 비용 가드: 1회 import 당 LLM 호출 최대 5회 (다중 페이지 PDF), 비용 모니터링 알람

#### 18.4.4 보안 & 프라이버시 (Menu-AI guide 학습)

- 업로드 이미지: S3 임시 버킷 (24h TTL 후 자동 삭제)
- 프로덕션 로그에 raw 이미지 미기록
- LLM API 호출 시 prompt injection 방지 (system prompt 분리, user content sanitize)

---

### 18.5 Path 3 — Web Scrape Import (Phase 2)

#### 18.5.1 워크플로우

```
[Step 1] 매장 웹사이트 URL 입력 (예: https://crispychicken.com)
   ↓
[Step 2] Deep crawl — "/menu", "/food", "/dining" 페이지 탐색 (Apify 패턴)
   ↓
[Step 3] 컨텐츠 타입 감지
   - HTML text (Wix, Squarespace, 자체 사이트) → DOM 파싱
   - PDF 링크 발견 → Path 2 (OCR) 위임
   - 이미지 메뉴만 발견 → Path 2 (OCR) 위임
   ↓
[Step 4] 구조화 + Review 화면 (Path 2와 동일)
   ↓
[Step 5] Preview & Execute
```

**한계 & 정책:**
- 로그인 필요한 페이지 미지원
- robots.txt 준수
- 자기 매장 URL만 허용 (소유권 검증: 메타 태그 또는 DNS TXT)
- Toast/Popmenu/Square 호스팅 URL은 별도 어댑터 (구조화된 데이터)

---

### 18.6 Path 4 — POS Export 변환 어댑터 (Phase 2)

#### 18.6.1 지원 매핑

각 POS의 export 형식 → RestoSync 5-sheet 형식 변환.

| POS | Export 형식 | RestoSync 매핑 |
|---|---|---|
| Square | Item Library CSV (Item Name, Variation, SKU, Price, Categories, ...) | ITEMS + CATEGORIES + Variations → MODIFIERS |
| Toast | Bulk Export CSV (Menu Group, Menu Item, Modifier Group, ...) | 그대로 매핑 (operation ID 보존) |
| Clover | Inventory CSV (Item, Category, Price, Modifier Group) | ITEMS + CATEGORIES + MODIFIERS |
| Lightspeed K | Item Export CSV (Screens, SKU, Modifier Strategy) | ITEMS + CATEGORIES, modifiers는 별도 import 안내 |
| Lightspeed O | Product Export CSV (Product ID, Name, Price, ...) | ITEMS only (Variants 불가 — 사용자에게 경고) |

#### 18.6.2 워크플로우

```
[Step 1] POS 선택 (Square/Toast/Clover/Lightspeed K/Lightspeed O)
   ↓
[Step 2] POS export CSV 업로드 (또는 OAuth 직접 API 호출 — Phase 3)
   ↓
[Step 3] 어댑터: 컬럼 매핑 자동 (POS별 매핑 정본 보유)
   - 매핑 불가 컬럼은 무시 + 경고
   - 가격 단위 변환 (Square cents, Toast dollars)
   ↓
[Step 4] RestoSync 5-sheet 형식으로 변환된 결과 표시
   ↓
[Step 5] Excel Import (18.3) 워크플로우와 동일하게 처리
```

**핵심 가치:** 경쟁사 솔루션에서 이탈하는 매장의 진입 장벽 제거. "Square를 떠나서 RestoSync로 와요" → Square Item Library export 한 번이면 끝.

---

### 18.7 Path 5 — Manual CRUD

기존 v1.0 Tablet UI (Page A/B). 변경 없음. 일상 운영 + 적은 항목용.

---

### 18.8 Import API 엔드포인트

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/api/menu/import/template` | `?format=xlsx\|csv_zip&lang=en\|ko\|es` | 표준 템플릿 다운로드 |
| POST | `/api/menu/import/excel/upload` | multipart file | 파일 업로드, validation job 시작 |
| GET | `/api/menu/import/jobs/:id` | | 진행 상태 polling |
| GET | `/api/menu/import/jobs/:id/errors` | | 에러 리포트 (CSV 다운로드 가능) |
| POST | `/api/menu/import/jobs/:id/preview` | | preview 데이터 반환 |
| POST | `/api/menu/import/jobs/:id/execute` | `{ mode: 'strict'\|'lenient', confirm: true }` | 트랜잭션 실행 |
| POST | `/api/menu/import/ai-ocr/upload` | multipart image/pdf | Path 2 — OCR job 시작 |
| POST | `/api/menu/import/ai-ocr/jobs/:id/review` | edited JSON | 사용자 검토 후 저장 |
| POST | `/api/menu/import/web-scrape/url` | `{ url, restaurant_id }` | Phase 2 |
| POST | `/api/menu/import/pos-adapter/upload` | `{ pos_type, file }` | Phase 2 |
| GET | `/api/menu/import/history` | | 과거 import 이력 |

**Auth:** 모두 owner/manager 권한 필수. kitchen 차단.
**Rate limit:** 10 import jobs/hour/store

---

### 18.9 DB 스키마 추가 (Drizzle)

```typescript
// packages/shared/src/enums.ts 추가
export const IMPORT_SOURCE = [
  'excel', 'csv', 'ai_ocr', 'web_scrape',
  'pos_square', 'pos_toast', 'pos_clover', 'pos_lightspeed', 'manual'
] as const;

export const IMPORT_STATUS = [
  'pending', 'validating', 'preview_ready',
  'executing', 'completed', 'failed', 'cancelled'
] as const;

// import_jobs 테이블
export const importJobs = pgTable('import_jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  storeId: uuid('store_id').notNull().references(() => stores.id),
  userId: uuid('user_id').references(() => users.id),
  source: text('source').notNull(),  // IMPORT_SOURCE
  status: text('status').notNull().default('pending'),  // IMPORT_STATUS
  
  // input
  fileUrl: text('file_url'),  // S3 path
  fileSize: integer('file_size'),
  fileType: text('file_type'),  // mime type
  
  // processing
  rawDataJson: jsonb('raw_data_json'),       // parsed input
  validatedDataJson: jsonb('validated_data_json'),  // post-validation
  errorReportJson: jsonb('error_report_json'),
  
  // results
  itemsCreated: integer('items_created').default(0),
  itemsUpdated: integer('items_updated').default(0),
  itemsFailed: integer('items_failed').default(0),
  categoriesCreated: integer('categories_created').default(0),
  modifiersCreated: integer('modifiers_created').default(0),
  combosCreated: integer('combos_created').default(0),
  
  // execution mode
  mode: text('mode').default('lenient'),  // strict | lenient
  
  // AI/OCR specific
  aiModel: text('ai_model'),  // 'gpt-4o' | 'claude-3.5-sonnet'
  aiCostUsd: decimal('ai_cost_usd', { precision: 10, scale: 4 }),
  aiConfidenceAvg: decimal('ai_confidence_avg', { precision: 3, scale: 2 }),
  
  // audit
  createdAt: timestamp('created_at').defaultNow().notNull(),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  cancelledAt: timestamp('cancelled_at'),
}, (t) => ({
  storeIdx: index('idx_import_store').on(t.storeId, t.createdAt),
  statusIdx: index('idx_import_status').on(t.status),
}));

// menu_items 테이블에 추가 컬럼
// external_id: text — Excel external_id 보존 (재import 매칭 키)
// import_job_id: uuid — 어느 import에서 생성되었나
// import_source: text — IMPORT_SOURCE

// menu_categories 테이블에도 동일하게 external_id 추가
```

---

### 18.10 신규 Business Rules

| ID | Rule |
|---|---|
| **BR-25** | Excel 가격 입력은 달러 (decimal), 서버에서 cents로 변환 후 저장 — BR-01 호환 |
| **BR-26** | external_id는 store 단위로 unique — store 간 중복 OK |
| **BR-27** | Import job은 24시간 후 raw file S3에서 자동 삭제 (privacy) |
| **BR-28** | AI OCR 이미지는 24시간 임시 S3, 프로덕션 로그에 미기록 |
| **BR-29** | Web Scrape는 자기 매장 URL만 — 소유권 검증 (메타태그/DNS TXT) |
| **BR-30** | Import 실행은 NOT reversible — 사용자 명시적 동의(체크박스) 필수 |
| **BR-31** | partial failure 시 valid row만 import, failed row는 에러 리포트 CSV |
| **BR-32** | external_id 충돌 시 update (덮어쓰기) — audit log에 before/after 기록 |
| **BR-33** | Import job 동시 실행 차단 (store당 1개) — race condition 방지 |
| **BR-34** | LLM 호출 실패 → 사용자에게 Excel 템플릿 fallback 안내 |

---

### 18.11 Open Questions (Import 관련)

| # | Question | 영향 | 추천 |
|---|---|---|---|
| Q16 | XLSX vs CSV 우선 — 기본 다운로드 포맷? | UX | **XLSX** (검증 드롭다운, 다중 시트), CSV ZIP 옵션 |
| Q17 | AI OCR LLM 선택 — GPT-4o vs Claude 3.5 Sonnet? | 비용, 정확도 | **Claude 3.5 Sonnet** (한국어/이모지 강함, vision 정확) 1차, GPT-4o fallback |
| Q18 | partial failure 기본 모드 — strict vs lenient? | 사용성 | **lenient** default + 사용자 토글로 strict 선택 |
| Q19 | Web Scrape 자체 운영 vs Apify? | 비용, 유지보수 | **Apify Actor 위임** (Phase 2 시 검증) |
| Q20 | 사진 일괄 업로드 — ZIP vs 폴더 매칭 vs 클라우드 링크? | UX | **ZIP** (filename = external_id.jpg 매칭) |
| Q21 | external_id 자동 생성 옵션? | UX | 옵션. 비어 있으면 `IMP-YYYYMMDD-NNN` 자동 생성 |

---

## 19. 단계별 개발 가이드 (Phase 1 MVP — 12주 Sprint Plan)

본인의 harness-engineering Subagent 패턴(@backend-dev, @frontend-dev, @db-architect, @test-writer, @reviewer, @devops)을 그대로 적용. 각 Sprint는 2주, MVP 12주(6 sprints) 완료 목표.

### 19.1 Sprint 0 — 준비 (Week 0, 1주)

**목표:** 인프라 점검 + 기존 자산 확인 + 본인 매장 Pickup 90→100%

| Day | Task | Owner | 산출물 |
|---|---|---|---|
| D1 | 기존 코드 audit — apps/api/src/db/schema.ts 현 상태 확인 | @reviewer | gap report |
| D1 | M01 PRD v1.2 → modules/CLAUDE-M01.md 변환 | Ryan | CLAUDE-M01.md |
| D2 | DB 스냅샷 + staging 환경 검증 | @devops | 백업 |
| D2-3 | Pickup 모듈 잔여 10% — bug fix list | @backend-dev | issue list |
| D4-5 | Pickup 4주 안정성 테스트 시작 (병행) | Ryan (dogfood) | 일일 로그 |
| D5 | Sprint 1 kickoff 준비 — 작업 분해 검증 | @reviewer | sprint backlog |

**Exit Criteria:** Pickup 100% 안정, M01 CLAUDE.md 확정, staging 깨끗.

---

### 19.2 Sprint 1 — DB Schema + Core API (Week 1-2)

**목표:** DB 마이그레이션 + Menu Items/Categories/Dayparts API

#### Tasks

| ID | Task | Owner | Hours | Deps |
|---|---|---|---|---|
| S1.1 | Migration 0010 menu_categories | @db-architect | 4 | - |
| S1.2 | Migration 0011 menu_items 확장 (i18n jsonb, dayparts array, allergens, ...) | @db-architect | 6 | S1.1 |
| S1.3 | Migration 0012 menu_dayparts | @db-architect | 3 | - |
| S1.4 | Migration 0013 menu_audit_log | @db-architect | 4 | - |
| S1.5 | Migration 0014 stores 확장 (i18n, currency, timezone) | @db-architect | 2 | - |
| S1.6 | Migration 0015 partial + GIN indexes | @db-architect | 4 | S1.2 |
| S1.7 | enums.ts 정본 (DAYPART, ALLERGEN, SPICE_LEVEL, ITEM_STATUS, SUPPORTED_LANG) | @backend-dev | 2 | - |
| S1.8 | Zod schemas (MenuItemCreate/Update, CategoryCreate, DaypartUpdate) | @backend-dev | 6 | S1.7 |
| S1.9 | GET /api/menu/items (filter: daypart, category, status, lang) | @backend-dev | 6 | S1.2, S1.8 |
| S1.10 | POST /api/menu/items | @backend-dev | 6 | S1.9 |
| S1.11 | PATCH /api/menu/items/:id | @backend-dev | 4 | S1.10 |
| S1.12 | DELETE /api/menu/items/:id (soft) | @backend-dev | 3 | S1.10 |
| S1.13 | PATCH /api/menu/items/:id/toggle-sold-out (fast-path) | @backend-dev | 4 | S1.10 |
| S1.14 | CRUD /api/menu/categories | @backend-dev | 6 | S1.1, S1.8 |
| S1.15 | GET/PUT /api/menu/dayparts (시간 겹침 검증) | @backend-dev | 6 | S1.3, S1.8 |
| S1.16 | Audit middleware (auto-log on mutation) | @backend-dev | 5 | S1.4 |
| S1.17 | Unit tests (Vitest) — coverage ≥ 80% | @test-writer | 12 | S1.9~S1.15 |
| S1.18 | Integration tests (testcontainers + PG real) | @test-writer | 8 | S1.17 |
| S1.19 | Code review + docs (OpenAPI swagger) | @reviewer | 6 | all |

**Total: ~97 hours** (1.5 dev x 2 weeks = ~120h 예상 capacity)

**Exit Criteria:**
- [ ] 6 migrations applied to staging
- [ ] All API endpoints return correct shape (manual curl test)
- [ ] Unit + integration tests pass, coverage ≥ 80%
- [ ] EXPLAIN ANALYZE: TV-visible query < 20ms (with seed of 1000 items)

**검증 시연 (Sprint Demo):**
- Postman/Bruno로 POST 항목 → GET 으로 조회 → PATCH toggle → audit log row 확인

---

### 19.3 Sprint 2 — Media Upload + WebSocket (Week 3-4)

**목표:** 사진 업로드 + 트랜스코딩 + WS 실시간 push

#### Tasks

| ID | Task | Owner | Hours |
|---|---|---|---|
| S2.1 | S3/R2 버킷 설정 + IAM 권한 | @devops | 4 |
| S2.2 | POST /api/menu/upload (multipart, 5MB 제한, MIME 검증) | @backend-dev | 6 |
| S2.3 | BullMQ 워커: 이미지 트랜스코딩 (sharp library) — 1920x1080, 400x300, WebP | @backend-dev | 10 |
| S2.4 | CDN 설정 (R2 + Cloudflare 또는 CloudFront) | @devops | 4 |
| S2.5 | WS 핸들러 setup (`@fastify/websocket`) | @backend-dev | 4 |
| S2.6 | WS 인증 (API key tv_instance_id) | @backend-dev | 4 |
| S2.7 | Redis pub/sub 채널 (store별) | @backend-dev | 6 |
| S2.8 | WS event: display:menu_item_updated/added/removed/sold_out_toggled | @backend-dev | 8 |
| S2.9 | WS event: display:daypart_changed (스케줄러 트리거) | @backend-dev | 6 |
| S2.10 | WS event: display:full_refresh + display:config_changed | @backend-dev | 4 |
| S2.11 | WS heartbeat + tv_screens.last_seen_at 업데이트 | @backend-dev | 4 |
| S2.12 | GET /api/menu/snapshot (Redis cache, ETag) | @backend-dev | 6 |
| S2.13 | Daypart 자동 전환 스케줄러 (BullMQ + cron) — 매장 타임존별 | @backend-dev | 8 |
| S2.14 | Unit + WS integration tests | @test-writer | 10 |
| S2.15 | Load test (k6): 50 concurrent TVs/store, p99 < 300ms | @test-writer | 6 |

**Total: ~90 hours**

**Exit Criteria:**
- [ ] 사진 업로드 → 10초 내 트랜스코딩 완료 → CDN URL 반환
- [ ] WS 연결 안정성 24시간 무중단 (heartbeat 정상)
- [ ] PATCH item → 3초 내 모든 연결 TV에 push
- [ ] Daypart 시간 도래 시 자동 전환 (3개 매장 타임존 시뮬레이션)

---

### 19.4 Sprint 3 — Tablet App Pages (Week 5-6)

**목표:** Tablet UI 5개 페이지 완성 (Manual CRUD 워크플로우 완결)

#### Tasks

| ID | Task | Owner | Hours |
|---|---|---|---|
| S3.1 | Expo Router 라우팅 설정 — `/menu`, `/menu/item/[id]`, `/menu/categories`, `/menu/daypart` | @frontend-dev | 6 |
| S3.2 | Page A — Menu Dashboard (3-col grid, sidebar, search) | @frontend-dev | 16 |
| S3.3 | Page B — Item Edit 4 Tabs (Basic / Schedule / Allergens / Display) | @frontend-dev | 20 |
| S3.4 | Page B — i18n input UI (EN/KO/ES 토글) | @frontend-dev | 8 |
| S3.5 | Page B — 사진 업로드 + 프리뷰 + 트랜스코딩 대기 UI | @frontend-dev | 8 |
| S3.6 | Page C — Categories 드래그앤드롭 (react-native-draggable-flatlist) | @frontend-dev | 10 |
| S3.7 | Page D — Daypart 6-time editor + 겹침 검증 inline | @frontend-dev | 10 |
| S3.8 | 86 토글 fast UX — Optimistic update + rollback on error | @frontend-dev | 6 |
| S3.9 | Search + filter — debounced query | @frontend-dev | 4 |
| S3.10 | Role-based UI — kitchen 사용자에게 가격 수정 비활성화 | @frontend-dev | 4 |
| S3.11 | Zustand state mgmt + React Query for API cache | @frontend-dev | 6 |
| S3.12 | E2E test (Playwright + Expo) — happy path 5개 시나리오 | @test-writer | 10 |
| S3.13 | Code review + a11y (대비 4.5:1, 키보드 네비) | @reviewer | 4 |

**Total: ~112 hours**

**Exit Criteria:**
- [ ] 점주 1인이 새 항목 추가 → 저장 → 5초 내 (모의) TV 반영
- [ ] 86 토글 → < 1초 UI 반응 (optimistic), 3초 내 서버 확인
- [ ] 카테고리 드래그앤드롭 정상, 순서 저장됨
- [ ] Daypart 겹치게 입력 시 422 에러 inline 표시

---

### 19.5 Sprint 4 — TV App 5-Zone Rendering (Week 7-8)

**목표:** Android TV 앱에서 5-Zone 메뉴보드 렌더 + 오프라인 캐시

#### Tasks

| ID | Task | Owner | Hours |
|---|---|---|---|
| S4.1 | React Native TV 0.83 프로젝트 setup (Android TV 11 타겟) | @frontend-dev | 6 |
| S4.2 | Zone A Header — Logo, store, daypart, clock, WS status | @frontend-dev | 6 |
| S4.3 | Zone B Featured Banner — 8s rotation + 우선순위 알고리즘 | @frontend-dev | 10 |
| S4.4 | Zone C Menu Grid — 2x3/3x3 카드, 사진+이름+가격 | @frontend-dev | 12 |
| S4.5 | Zone D Ticker — 가로 무한 스크롤 | @frontend-dev | 6 |
| S4.6 | Zone E Category Tabs (옵션 토글) | @frontend-dev | 4 |
| S4.7 | WS 연결 + 자동 재연결 (exponential backoff) | @frontend-dev | 8 |
| S4.8 | Snapshot pull on startup + on WS disconnect | @frontend-dev | 6 |
| S4.9 | 오프라인 캐시 (AsyncStorage + 이미지 로컬 캐시) | @frontend-dev | 10 |
| S4.10 | Daypart 클라이언트측 자동 전환 (매분 체크) | @frontend-dev | 4 |
| S4.11 | SOLD OUT 오버레이 + 회색 + 가격 취소선 | @frontend-dev | 4 |
| S4.12 | i18n — 한/영/스페인어 폰트 임베드 (Pretendard, Noto Sans CJK) | @frontend-dev | 6 |
| S4.13 | 페이드 애니메이션 (Reanimated 3) — 항목 추가/제거/업데이트 | @frontend-dev | 8 |
| S4.14 | LTO 클라이언트 매분 체크 (available_until 도래 시 비표시) | @frontend-dev | 4 |
| S4.15 | TV pair (6-digit code) flow | @frontend-dev | 6 |
| S4.16 | E2E (Detox or manual): TV reboot 후 정상 복구 | @test-writer | 8 |
| S4.17 | MECOOL KM2 Plus 실기 테스트 — 24h soak test | Ryan + @test-writer | 8 |

**Total: ~116 hours**

**Exit Criteria:**
- [ ] MECOOL KM2 Plus에서 안정적으로 24시간 렌더
- [ ] 인터넷 30분 끊겨도 마지막 메뉴 유지
- [ ] 가격 변경 → 5초 내 페이드 전환
- [ ] 86 토글 → 3초 내 SOLD OUT 표시
- [ ] 한/영 폰트 깨짐 없음

---

### 19.6 Sprint 5 — Excel Import + Templates (Week 9-10)

**목표:** Path 1 (Excel/CSV) 완전 작동 + 표준 템플릿 배포

#### Tasks

| ID | Task | Owner | Hours |
|---|---|---|---|
| S5.1 | DB 마이그레이션 0023 import_jobs 테이블 | @db-architect | 4 |
| S5.2 | DB 마이그레이션 0024 menu_items/categories에 external_id, import_job_id 추가 | @db-architect | 4 |
| S5.3 | 표준 XLSX 템플릿 생성 (Python openpyxl 또는 SheetJS) — 5 sheets + README + ENUMS hidden | @backend-dev | 10 |
| S5.4 | 템플릿 다국어 버전 (EN/KO/ES) | @backend-dev | 4 |
| S5.5 | GET /api/menu/import/template — XLSX/CSV ZIP 생성 | @backend-dev | 6 |
| S5.6 | POST /api/menu/import/excel/upload — 파일 검증 + S3 저장 + job 생성 | @backend-dev | 6 |
| S5.7 | BullMQ 워커: XLSX 파싱 (ExcelJS) → 구조화 JSON | @backend-dev | 12 |
| S5.8 | 검증 엔진 — Zod schemas + 도메인 규칙 (external_id 중복, 참조 무결성, daypart 유효성) | @backend-dev | 16 |
| S5.9 | GET /api/menu/import/jobs/:id — 진행 상태 | @backend-dev | 4 |
| S5.10 | GET /api/menu/import/jobs/:id/errors — CSV 에러 리포트 | @backend-dev | 6 |
| S5.11 | POST /api/menu/import/jobs/:id/preview — preview 데이터 | @backend-dev | 4 |
| S5.12 | POST /api/menu/import/jobs/:id/execute — 트랜잭션 일괄 INSERT | @backend-dev | 12 |
| S5.13 | 사진 일괄 매칭 (ZIP 업로드, filename → external_id) | @backend-dev | 8 |
| S5.14 | Tablet UI — Page H Import Wizard (8-step) | @frontend-dev | 20 |
| S5.15 | Tablet UI — Preview 화면 + 에러 리포트 다운로드 | @frontend-dev | 10 |
| S5.16 | Tablet UI — confirm modal "NOT reversible" 체크박스 | @frontend-dev | 4 |
| S5.17 | E2E: 100-item Excel → upload → execute → TV 반영 | @test-writer | 10 |
| S5.18 | 본인 매장 메뉴 실제 Excel로 이전 (dogfood) | Ryan | 4 |

**Total: ~144 hours**

**Exit Criteria:**
- [ ] 100 항목 Excel 업로드 → 검증 → preview → 실행 < 60초 전체
- [ ] 에러 row가 있을 때 lenient mode로 valid만 import + 에러 리포트 다운로드
- [ ] 본인 매장 실제 메뉴를 Excel로 이전 성공
- [ ] external_id로 재import 시 update 정상 동작

---

### 19.7 Sprint 6 — Polish + Pilot Prep (Week 11-12)

**목표:** MVP 안정화 + 본인 매장 dogfooding 4주 시작 + 베타 매장 1곳 섭외

#### Tasks

| ID | Task | Owner | Hours |
|---|---|---|---|
| S6.1 | Error handling 통일 — trace_id, 다국어 에러 메시지 | @backend-dev | 6 |
| S6.2 | Rate limiting (100 mutation/min/user) + abuse 모니터링 | @backend-dev | 4 |
| S6.3 | APM 설정 (Datadog 또는 Grafana) — p50/p99 메트릭 | @devops | 6 |
| S6.4 | TV 헬스 모니터링 대시보드 (last_seen, error rate) | @frontend-dev | 8 |
| S6.5 | Documentation — 점주용 사용 가이드 (영어 + 한국어) | Ryan + tech-writer | 8 |
| S6.6 | Documentation — Onboarding 비디오 5분 (Loom) | Ryan | 4 |
| S6.7 | 가격 페이지 + 약관 초안 (월 구독, 취소 자유) | Ryan | 6 |
| S6.8 | 본인 매장 dogfooding 4주 시작 — daily log | Ryan | 4 (daily 30분 x 14d = 7h, 첫주 setup 포함 4h) |
| S6.9 | 베타 매장 1곳 섭외 (한식 매장 우선) — 미팅, 데모, 계약 | Ryan | 8 |
| S6.10 | Bug fix sprint — 누적된 P1/P2 이슈 처리 | @backend-dev + @frontend-dev | 24 |
| S6.11 | 보안 review — 모든 mutation에 RBAC 확인, SQL injection 검사 | @reviewer | 6 |
| S6.12 | 코드 리팩토링 — 누적 기술 부채 일부 정리 | @backend-dev | 8 |
| S6.13 | Release notes v0.1.0 + 다음 sprint 계획 | Ryan | 4 |

**Total: ~96 hours**

**Exit Criteria (MVP 종료):**
- [ ] 본인 매장 실 운영 14일 무중단 (사고 0)
- [ ] 베타 매장 1곳 계약 + 하드웨어 설치 일정 확정
- [ ] 모든 P1 버그 해결, P2 50% 처리
- [ ] APM에서 모든 메트릭 SLA 충족 확인
- [ ] 다음 Phase 1.5 백로그 정리

---

### 19.8 Phase 1.5 — Sprint 7-9 (Week 13-18, 6주)

**Sprint 7-8: AI OCR Import + Recipe-Linked Auto 86 (D5)**
- AI OCR 워크플로우 (Claude 3.5 Sonnet Vision) — 종이 메뉴 → 디지털 전환
- Recipe-Ingredient DB 스키마 + 자동 86 트리거 로직
- Tablet UI — Recipe 관리 페이지

**Sprint 9: Multi-Zone (Menu + Pickup) + Bulk Actions**
- TV App: 동적 zone layout (Pickup queue 비면 Menu 영역 확장)
- Tablet UI — 일괄 작업 (가격 +5%, 카테고리 일괄 86)
- CSV import/export 추가 (간단 형식)

**Exit:** 베타 매장 2곳 추가, 본인 + 베타 3곳 운영 안정.

---

### 19.9 Phase 2 — Sprint 10-15 (Week 19-30, 12주)

- **POS Export 변환 어댑터** (Square 우선, Toast 차순) — Path 4
- **Web Scrape Import** — Path 3 (Apify Actor 또는 자체)
- **Menu Engineering Matrix (D6)** — Sales × Margin 4-quadrant 대시보드
- **알레르기/칼로리 TV 표시 (M7)** — 캘리포니아·뉴욕 법규 대응
- **Drag-and-drop editor 강화** — Tablet UI 개선

**Exit:** 베타 5곳 운영, 페이드 파일럿 진입 준비.

---

### 19.10 Phase 3 — Sprint 16-21 (Week 31-42)

- **Multi-Restaurant FoodCourt Mode (D7)** — 한 TV에 여러 매장
- **다지점 통합 대시보드 (M14)** — Chain management
- **Open POS Adapter 정식 출시 (D8)** — Square/Toast OAuth + Webhook
- **템플릿 라이브러리 50+** — 매장 타입별 UI 프리셋

---

### 19.11 Phase 4 — Sprint 22-27 (Week 43-54)

- **AI 추천 + 동적 가격 (M16)** — Toast IQ 대응
- **A/B 테스팅 (M15)** — Featured Banner A/B
- **유료 GA 출시**

---

## 20. Sprint별 Subagent 할당 매트릭스

| Sprint | @backend-dev | @frontend-dev | @db-architect | @test-writer | @devops | @reviewer |
|---|---|---|---|---|---|---|
| S0 | △ Pickup 잔여 | - | △ snapshot | - | ✅ | ✅ |
| S1 | ✅ API | - | ✅ Migrations | ✅ Unit/Int | - | ✅ |
| S2 | ✅ WS/Media | - | - | ✅ Load | ✅ S3/CDN | ✅ |
| S3 | △ API tweaks | ✅ Tablet UI | - | ✅ E2E | - | ✅ a11y |
| S4 | - | ✅ TV App | - | ✅ Detox | △ device | ✅ |
| S5 | ✅ Import API | ✅ Wizard UI | ✅ import_jobs | ✅ E2E import | △ S3 | ✅ |
| S6 | ✅ Polish | ✅ Health UI | - | △ regression | ✅ APM | ✅ Security |

---

## 21. 통합 Acceptance Criteria — MVP 종료

### 21.1 기능 (Functional)
- [ ] Tablet 항목 추가 → 5초 내 TV 반영 (99%)
- [ ] 86 토글 → 3초 내 SOLD OUT 표시
- [ ] Daypart 자동 전환 (운영자 개입 0)
- [ ] 다국어 입력 → TV에서 default_language 표시
- [ ] 사진 5MB 업로드 → 10초 내 트랜스코딩 완료
- [ ] 인터넷 30분 끊겨도 메뉴 유지
- [ ] WS 재연결 시 snapshot 자동 동기화
- [ ] 변경 시 audit log 1건 자동 기록
- [ ] **Excel 100-item import → 60초 내 완료 (검증 + execute)**
- [ ] **에러 row 있을 때 valid만 import + CSV 에러 리포트 다운로드**

### 21.2 비기능 (Non-Functional)
- [ ] API p99 < 300ms (1k items, 10 concurrent TVs)
- [ ] DB query (partial idx) < 20ms
- [ ] 단위 테스트 coverage ≥ 80%
- [ ] E2E: tablet → API → WS → TV 전체 흐름 통과

### 21.3 보안 (Security)
- [ ] 모든 mutation JWT 인증
- [ ] RBAC: kitchen은 86 토글 only
- [ ] SQL injection 방지 (Drizzle parameterized)
- [ ] 사진 MIME type 서버 검증
- [ ] Rate limit 100/min/user
- [ ] Import 파일 S3 24h auto-delete

### 21.4 운영 (Operations)
- [ ] APM 메트릭 수집 (p50/p99, error rate)
- [ ] TV 헬스 모니터링 대시보드 작동
- [ ] BullMQ 큐 모니터링 (transcode + import worker)
- [ ] 본인 매장 14일 무중단 실 운영
- [ ] 점주용 가이드 문서 (영/한) + 5분 비디오

---

## 22. Engineering Handoff v1.2

### 22.1 즉시 시작 (Week 0)
1. v1.2 PRD → `modules/CLAUDE-M01.md` 변환 (Claude Code 세션용)
2. Pickup 잔여 10% 작업 분해 + 본인 매장 검증 시작
3. Sprint 1 backlog 확정 (`S1.1 ~ S1.19`)
4. DB staging 백업

### 22.2 의사결정 필요 (Sprint 1 시작 전)
- Q2: 사진 저장 — R2 vs S3 → **R2 추천** (egress free)
- Q4: 가격 변경 중 주문 적용 → **미적용** (주문 시점 스냅샷)
- Q9 (v1.1): Modifier TV 표시 정책
- Q17 (v1.2): AI OCR LLM — Claude vs GPT
- Q18 (v1.2): partial failure 기본 모드 — lenient

### 22.3 Phase 1 종료 후 의사결정
- Q14 (v1.1): POS conflict master 정책
- Q19 (v1.2): Web Scrape 자체 vs Apify

---

**End of PRD-M01 v1.2**

*Changelog v1.1 → v1.2:*
- Section 18 신규 — Menu Import 시스템 (5 paths, Excel/AI OCR/Web Scrape/POS/Manual)
- Section 19 신규 — 단계별 개발 가이드 (Phase 1 MVP 12주, Sprint 0~6, 작업 분해)
- Section 20 신규 — Subagent 할당 매트릭스
- Section 21 신규 — 통합 Acceptance Criteria
- Section 22 신규 — Engineering Handoff v1.2
- 신규 차별화 D9 추가 (Multi-Path Onboarding)
- 신규 BR 10개 (BR-25~BR-34)
- 신규 엔드포인트 11개 (Import API)
- 신규 enums 2개 (IMPORT_SOURCE, IMPORT_STATUS)
- 신규 DB 테이블 1개 (import_jobs) + 컬럼 (external_id, import_job_id)
