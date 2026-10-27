# CLAUDE-M01.md — Menu Module (v3 · PRD v1.2 정본)
> **세션 로드 순서:** CLAUDE.md → ANTI-GLOBAL.md → ANTI-M01.md → 이 파일
> v3 (2026-05-17) — PRD-M01-Menu-Module-v1.2.md 전면 반영
> 변경: 6-Daypart, 5-page Tablet, 5-Zone TV, 11 Import API, BR-01~34, D1~D9, 5-lang i18n

---

## 0. Stack 확정

- **Backend:** apps/api — Fastify v4 · Drizzle · PG 16 · Redis 7 · BullMQ (MIT) · node-cron
- **Tablet:** apps/tablet — Expo Router v3 · Zustand · TanStack Query · expo-image-picker
- **TV:** apps/tv — React Native TV 0.74 · Zustand (menuStore) · expo-keep-awake · Reanimated 3
- **Media:** Cloudflare R2 + Cloudflare CDN (Q2 확정 2026-05-17) — `@aws-sdk/client-s3` SDK + R2 endpoint. Phase 2+ S3 전환 시 endpoint 환경변수만 변경 + rclone 데이터 복사
- **Snapshot:** `orders.line_items_snapshot jsonb` (Q4 확정 — 가격 변경은 진행 주문 미적용, BR-12)
- **Import:** lenient 기본, strict 토글 (Q18 확정 — BR-31)
- **AI OCR:** Claude 3.5 Sonnet Vision (Phase 1.5) — Q17 Sprint 5 진입 전 확정

---

## 1. Canonical constants (반드시 정본만 사용)

### 1.1 6-Daypart — additive 결정 (Sprint 1 S1.3에서 묶음 패치)

```typescript
// packages/shared/src/enums.ts — Sprint 1 S1.3에서 schema.ts + migration 묶음 갱신
export const DAYPART = [
  'breakfast',  // ~ 11:00 (매장별 override, stores.daypart_windows)
  'lunch',      // 11:00 ~ 14:30
  'snack',      // 14:30 ~ 17:00   ← NEW (카페·디저트 매장 차별화)
  'dinner',     // 17:00 ~ 21:00
  'late',       // 21:00 ~ 02:00   ← NEW (다이너·주점 차별화)
  'all',        // wildcard (항상 노출 — Excel default 등)
] as const;
export type Daypart = (typeof DAYPART)[number];
```

**Additive 마이그레이션 (PG `ALTER TYPE ADD VALUE`)** — 기존 4값(`breakfast/lunch/dinner/all`) 그대로 보존, `snack`/`late`만 신규. 기존 코드/데이터 0 변경 (AG-013 additive 확장 패턴, orderStatus 9-state 확장과 동일).

> 'closed'는 daypart가 아닌 `stores.business_hours` 영역으로 분리 — 영업 종료 시 메뉴 비표시는 store status로 처리.
> 모든 daypart 계산은 `stores.timezone` 기준 (BR-02). UTC 직접 비교 금지.
> Sprint 1 S1.3 단일 commit: `enums.ts` + `schema.ts` pgEnum + `migrations/0006_daypart_add_snack_late.sql` 동시. drift 1프레임 금지.

### 1.2 5-Lang i18n

```typescript
export const SUPPORTED_LANG = ['en','ko','es','zh','ja'] as const;
// stores.default_language (default: 'en'). menu_items.name/description = jsonb {en, ko, ...}.
```

### 1.3 Allergen / Spice / Item Status

```typescript
export const ALLERGEN = [
  'milk','egg','fish','shellfish','tree_nut','peanut','wheat','soy','sesame', // FDA 9
] as const;
export const SPICE_LEVEL = ['none','mild','medium','hot','extreme'] as const;
export const ITEM_STATUS = ['active','sold_out','archived'] as const;
export const IMPORT_SOURCE = [
  'excel','csv','ai_ocr','web_scrape',
  'pos_square','pos_toast','pos_clover','pos_lightspeed','manual',
] as const;
export const IMPORT_STATUS = [
  'pending','validating','preview_ready','executing','completed','failed','cancelled',
] as const;
```

### 1.4 Price · Currency · Time (BR-01/02 강제)

- **가격은 항상 integer cents.** `priceCents`, `priceDeltaCents`. `decimal('price', 10, 2)` 금지.
- **Excel 입력만 달러 (decimal)** — 서버에서 cents 변환 (BR-25).
- **모든 시간은 UTC 저장 + `stores.timezone` 으로 매장 로컬 변환** (BR-02).

---

## 2. Differentiation D1~D9

| ID | 차별화 | Phase |
|----|--------|-------|
| D1 | Multi-zone (Menu + Pickup + Event) | P1 (M01 + M02) |
| D2 | 6-Daypart 자동 전환 (매장 timezone 기반) | P1 |
| D3 | Open POS-agnostic (lock-in 없음) | P1 (Adapter는 P2) |
| D4 | 5-Lang i18n (한·중·일 포함) | P1 |
| D5 | Recipe-linked Auto 86 (재고 → 메뉴) | P1.5 |
| D6 | Menu Engineering Matrix 내장 (Star/Plow/Puzzle/Dog) | P2 |
| D7 | Multi-Restaurant FoodCourt Mode | P2 |
| D8 | Open POS Adapter (Square 1차, Toast/Clover/Chowbus 후속) | P2~P3 |
| D9 | Multi-Path Onboarding (Excel/AI OCR/Web Scrape/POS Export/Manual — 5 paths) | P1 (Excel) + P1.5 (OCR) + P2 (Scrape/POS) |

---

## 3. Pages (Tablet — 5 P1 pages + 4 Phase 1.5~2 pages)

### 3.1 Page A — `/menu` Dashboard (P1)
- 3-col grid (사진 thumb + name + price + 86 toggle + daypart chip)
- 좌측 sidebar: 카테고리 트리, daypart 필터, 검색
- 우상: + Add Item / Import Wizard 진입 (Page H)

### 3.2 Page B — `/menu/item/[id]` Item Edit (P1, **6 탭**)
1. **Basic** — name (5-lang), description (5-lang), category, price (cents), photo
2. **Schedule** — dayparts (multi-select 6값), LTO (available_from/until)
3. **Allergens** — FDA 9 allergens, calories, spice_level
4. **Display** — show_on_tv, sort_order, is_featured, kitchen_name (KDS 약식)
5. **Modifiers/Variants** (v1.1 신규) — size variants + modifier groups attach
6. **Ingredients** (P1.5) — recipe (item ↔ ingredient N:M, quantity per serving)

### 3.3 Page C — `/menu/categories` (P1)
- 드래그앤드롭 정렬 (react-native-draggable-flatlist)
- 카테고리 5-lang + icon (emoji) + is_active
- 삭제 차단 + "옵션 이동" 강제 (Q7)

### 3.4 Page D — `/menu/daypart` (P1)
- 6-Daypart 시간 windows 편집 (HH:MM ~ HH:MM)
- 겹침 검증 inline (422 시 강조)
- 매장 timezone 표시

### 3.5 Page E — `/menu/import` Import Wizard (P1, 8-step)
Step1 템플릿 DL → Step2 작성 → Step3 업로드 → Step4 사진 일괄 → Step5 검증 → Step6 에러 리포트 → Step7 Preview + "NOT reversible" 체크박스 → Step8 트랜잭션 실행

### 3.6 Page F — `/menu/featured` Featured Rules (P1)
- Active rotation preview
- Rules: Always (Chef's Pick) / LTO 자동 / Low Inventory / Daypart-based / Analytics Auto (P2)
- 회전 간격 5/8/10/12s

### 3.7 Page G — `/menu/combos` Combos (P1)
- 콤보 이름 + 구성 항목 드래그
- 정가 합계 vs 콤보가 (BR-23: 콤보가 ≤ 정가합)
- swappable group (Choose 1 main + 1 side + 1 drink)

### 3.8 Page H — `/menu/analytics` (P2) — Engineering Matrix 2×2
### 3.9 Page I — `/menu/ingredients` (P1.5) — Recipe + 재고 관리

---

## 4. TV — 5-Zone Layout (1920×1080)

```
┌─ Zone A · Header (8%) — Logo · Store · Daypart · Clock · WS status ─┐
├──────────────────────────┬──────────────────────────────────────────┤
│ Zone B · Featured (22%)  │ Zone C · Menu Grid (60%)                 │
│  ─ 8s rotation           │  ─ 2x3 또는 3x3 카드                     │
│  ─ priority 알고리즘     │  ─ 사진 + name + price (+tax 표시)       │
│  ─ pool: chef_pick, LTO, │  ─ SOLD OUT: 회색 + 가격 취소선 (BR-08)  │
│         low_inventory,   │  ─ 카테고리 탭 (옵션 — Zone E)           │
│         analytics (P2)   │                                          │
├──────────────────────────┴──────────────────────────────────────────┤
│ Zone D · Ticker (10%) — 이벤트 ticker_text (M03 연동) · 좌→우 무한 │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.1 Multi-Zone 통합 정책 (D1)

- 같은 TV에서 M01(Menu) + M02(Pickup) 공존: `tv_content_profiles.profile_type` 으로 분기
- Pickup queue가 비면 Menu 영역 자동 확장 (Phase 1.5)
- 충돌 우선순위: **Pickup Featured > Menu Featured** (안전 표시 우선)

### 4.2 Featured Banner Rotation (BR-21)

- 매 분 풀 재평가 → 매 8초 회전
- 풀: `is_featured=true` ∪ `menu_featured_rules` 조건 매칭
- 조건: `chef_pick`, `lto` (`available_until - now() < 2일`), `low_inventory`, `daypart`, `analytics:star/puzzle` (P2)
- 정렬: `priority DESC`, `rotation_slot ASC`

### 4.3 Daypart 클라이언트 전환 (BR-02)

```typescript
// 매분 체크 (매장 timezone 기준)
// 반환 nullable — 매칭 윈도우 없을 때 caller가 stores.business_hours 분기
function currentDaypart(now: Date, tz: string, windows: DaypartWindow[]): Daypart | null {
  const local = toZonedTime(now, tz);
  return windows.find(w => isWithinInterval(local, w))?.name ?? null;
}
// caller 패턴:
//   const dp = currentDaypart(now, store.timezone, store.daypart_windows);
//   if (dp === null && !isWithinBusinessHours(now, store))
//     return <ClosedView reopensAt={nextOpen(store)} />;
//   const effective = dp ?? 'all';  // 영업 중인데 daypart 누락 = wildcard
```
> 'closed'는 daypart enum 값이 아님 (AG-013 변형값 차단). 영업 종료 표시는 `stores.business_hours` 분기로 처리.

### 4.4 4-state UI (AG-014 / UX-001)
모든 TV/Tablet 화면: Loading / Empty / Error / Offline.

---

## 5. API Endpoints — Catalog (prefix `/api/` — AG-009)

### 5.1 Menu CRUD (P1 · Sprint 1)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/menu/items` | `?daypart=&category=&status=&lang=&store_id=` (AG-021: server-side filter) |
| POST | `/api/menu/items` | priceCents, name jsonb |
| PATCH | `/api/menu/items/:id` | sync_source != 'restosync' → 403 (BR-20) |
| DELETE | `/api/menu/items/:id` | soft delete (deleted_at) |
| PATCH | `/api/menu/items/:id/toggle-sold-out` | kitchen 권한 허용 (AM01-008) |
| GET/POST/PATCH/DELETE | `/api/menu/categories[/:id]` | 드래그 정렬 |
| GET/PUT | `/api/menu/dayparts` | 겹침 검증 422 |
| POST | `/api/menu/upload` | multipart, 5MB, MIME 검증 → BullMQ transcode (Sprint 2 S2.5) — `?legacy=true` 호환 모드 |
| GET | `/api/menu/upload/jobs/:id` | BullMQ job status polling (Sprint 2 S2.9) |
| GET | `/api/menu/snapshot` | Redis cache 60s + ETag + If-None-Match → 304 (BR-03, Sprint 2 S2.15) |

### 5.2 Modifiers / Variants / Combos (P1 · Sprint 1.5~2)

| Method | Path |
|---|---|
| GET/POST/PATCH/DELETE | `/api/menu/items/:id/variants[/:variant_id]` |
| GET/POST/PATCH/DELETE | `/api/menu/modifier-groups[/:id]` |
| POST/DELETE | `/api/menu/items/:id/attach-modifier-group/:group_id` |
| GET/POST/PATCH/DELETE | `/api/menu/combos[/:id]` |
| GET | `/api/menu/featured/current?tv_instance_id=` |
| PUT | `/api/menu/featured/rules` |

### 5.3 Import 11 endpoints (P1 Excel · Sprint 5 / P1.5 OCR / P2 Scrape+POS)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/menu/import/template` | `?format=xlsx\|csv_zip&lang=` |
| POST | `/api/menu/import/excel/upload` | multipart, 10MB, BullMQ job |
| GET | `/api/menu/import/jobs/:id` | 진행 상태 polling |
| GET | `/api/menu/import/jobs/:id/errors` | CSV 다운로드 |
| POST | `/api/menu/import/jobs/:id/preview` | preview data |
| POST | `/api/menu/import/jobs/:id/execute` | `{mode:'strict'\|'lenient', confirm:true}` (BR-30/31) |
| POST | `/api/menu/import/ai-ocr/upload` | Claude Vision (Q17) |
| POST | `/api/menu/import/ai-ocr/jobs/:id/review` | edited JSON |
| POST | `/api/menu/import/web-scrape/url` | 자기 매장 URL 소유권 검증 (BR-29) |
| POST | `/api/menu/import/pos-adapter/upload` | `{pos_type, file}` |
| GET | `/api/menu/import/history` | 24h S3 TTL (BR-27) |

**Import auth:** owner/manager only. kitchen 차단. Rate limit 10 jobs/hour/store. Job 동시실행 차단 (BR-33).

### 5.4 Ingredients · Analytics (P1.5 / P2)

```
GET/POST/PATCH /api/menu/ingredients[/:id]
PATCH /api/menu/ingredients/:id/stock-adjust
POST /api/menu/items/:id/recipe
GET /api/menu/analytics/engineering-matrix?from=&to=&category_id=
GET /api/menu/analytics/popularity | /margin | /featured-recommendations
```

---

## 6. WebSocket Events — M01 신규 8개 (AG-003 콜론+소문자)

| Event | Direction | Payload | TV/Tablet 동작 |
|-------|-----------|---------|---------------|
| `display:menu_item_added` | Server→TV | `{ item }` | Zone C 카드 추가 (fade-in) |
| `display:menu_item_updated` | Server→TV | `{ item }` | 해당 카드 갱신 |
| `display:menu_item_removed` | Server→TV | `{ item_id }` | 카드 제거 (fade-out) |
| `display:menu_item_sold_out_toggled` | Server→TV | `{ item_id, sold_out }` | SOLD OUT 오버레이 |
| `display:daypart_changed` | Server→TV | `{ daypart }` | 메뉴 풀 재계산 |
| `display:full_refresh` | Server→TV | `{}` | snapshot 재로드 (import 완료 직후) |
| `display:config_changed` | Server→TV | `{ tv_instance_id }` | profile/zone 재구성 |
| `display:featured_rotation` | Server→TV | `{ item_id, slot, duration_sec }` | Zone B 회전 |

**v1.1 추가 (S2/S5):** `display:variant_toggled`, `display:combo_updated`, `display:ingredient_low` (P1.5), `tablet:analytics_updated` (P2).

→ **broadcast.ts ALLOWED_EVENTS allowlist에 등록 필수** (gap 식별됨).
→ **WS broadcast는 DB commit 후에만** — read-after-write 일관성 (AM01-006).

---

## 7. DB Schema 변경 요약

### 7.1 마이그레이션 순서 (`apps/api/src/db/migrations/`)

```
이미 적용: 0000 / 0001 / 0002
(0003~0009: M02 Pickup polish 슬롯 — 미사용 시 skip)

── P1 (Sprint 1) ───────────────────────────────────────
0010_menu_categories.sql
0011_menu_items_extend_columns.sql       ← price_cents, name jsonb, dayparts text[],
                                            has_variants, has_modifiers, tax_policy,
                                            tax_category_id, sync_source, external_id,
                                            external_updated_at, last_synced_at,
                                            sync_conflict_at, import_job_id, import_source
0012_menu_dayparts.sql                   ← 6-value + stores.daypart_windows jsonb
0013_menu_audit_log.sql
0014_stores_i18n_columns.sql             ← default_language, supported_languages text[]
                                            (※ 0015_menu_partial_indexes 슬롯은 v1.1 modifiers로 회수됨)

── P1 v1.1 (Sprint 4 S4.5a, 2026-05-19) ────────────────
0015_menu_v11_modifiers_variants.sql     ← menu_variants + menu_modifier_groups + menu_modifier_options + menu_item_modifier_groups (단일 — drizzle-kit generate 결과, AG-018 복합 unique 포함)

── P1.5 prep (Sprint 4 S4.6, 2026-05-19) ───────────────
0016_menu_ingredients.sql                ← INGREDIENT_UNIT 9-value CHECK + stock_quantity numeric(12,3) + min_threshold + external_id partial unique (BR-26) — P1.5 BR-19 prep
0017_menu_item_ingredients.sql           ← recipe N:M, AG-018 (store_id,item_id,ingredient_id) unique, quantity numeric(10,3) CHECK>0, ingredient FK RESTRICT

── P1 후속 (Sprint 5+) ─────────────────────────────────
0018_menu_combos.sql                     ← Sprint 5+ (TBD)
0019_menu_combo_items.sql                ← Sprint 5+ (TBD)
0020_menu_featured_rules.sql             ← Page F (TBD)

── P2 (Sprint 10+) ─────────────────────────────────────
0027_menu_item_analytics_cache.sql
0028_food_courts.sql
0029_food_court_members.sql
```

### 7.2 신규 5 핵심 테이블 (P1 필수)

`menu_categories` · `menu_variants` · `menu_modifier_groups` · `menu_combos` · `menu_featured_rules` · `import_jobs`

스키마 본문은 PRD §7.1, §18.9 참조. AG-001/018: 모든 테이블 `store_id` FK + 매장 단위 unique.

### 7.3 external_id 정책 (BR-26)

```
UNIQUE (store_id, external_id)   -- store 내만 unique, store 간 중복 OK
```

> ❌ `external_id` 전역 unique → AM01-003 위반.

---

## 8. Business Rules (BR-01 ~ BR-34 · 발췌 + 참조)

### 8.1 v1.0 Core (BR-01~15) — PRD v1.0 본 (별도 문서)
- **BR-01** 가격은 항상 cents (integer)
- **BR-02** 모든 시간 UTC + stores.timezone 변환
- **BR-03** TV는 snapshot + WS invalidation (60s TTL)
- **BR-04** 사진 5MB / WebP 트랜스코딩
- **BR-05** Soft delete (deleted_at)
- **BR-06** Audit log on mutation (operation, before/after, user_id)
- **BR-07** RBAC: kitchen은 86 toggle만
- **BR-08** Sold out → 회색 + 가격 취소선 + 주문 차단
- **BR-09** Daypart는 stores.timezone 기준
- **BR-10** LTO: available_until 도래 시 자동 비표시 (TV 매분 + 서버 매시)
- **BR-11** i18n: 누락 lang은 default_language로 fallback
- **BR-12** 가격 변경은 진행 중 주문에 영향 없음 (orders.line_items_snapshot)
- **BR-13** Sort order: ASC, 동률 시 created_at ASC
- **BR-14** Category 삭제 차단 (옵션 이동 강제)
- **BR-15** Featured는 항목당 1 slot, 중복 차단

### 8.2 v1.1 Modifiers/Combos/POS (BR-16~25)
- BR-16 Variant 가격 = base + price_delta
- BR-17 Modifier min/max 검증 (M02 주문 시)
- BR-18 Combo isSubstitutable: 같은 group_name 내 교체
- BR-19 재료 재고 < (recipe × 5) → 자동 sold_out (P1.5)
- BR-20 sync_source ≠ 'restosync' → PATCH 거부 (403)
- BR-21 Featured: 매분 풀 재평가, 매 8초 회전
- BR-22 Tax policy 항목 default = 매장 default (override 가능)
- BR-23 Combo 가격 ≤ 정가 합계 (422)
- BR-24 Analytics class 재계산 03:00 매장 timezone (BullMQ cron)
- BR-25 Excel 가격 입력 = 달러 → 서버 cents 변환 (BR-01 호환)

### 8.3 v1.2 Import (BR-26~34)
- **BR-26** external_id store 단위 unique
- **BR-27** Import raw file 24h S3 TTL 자동 삭제
- **BR-28** AI OCR 이미지 24h 임시 + 로그 미기록
- **BR-29** Web Scrape 자기 매장 URL only (meta/DNS 검증)
- **BR-30** Import 실행 NOT reversible — 체크박스 동의 필수
- **BR-31** Partial failure: valid만 import (lenient) + CSV 에러 리포트
- **BR-32** external_id 충돌 → update + audit log before/after
- **BR-33** Import job store당 동시 1개만 (race 방지)
- **BR-34** LLM 실패 → Excel fallback 안내

---

## 9. RBAC

| Role | Item CRUD | Sold-out toggle | Daypart 편집 | Import | Analytics |
|------|-----------|-----------------|--------------|--------|-----------|
| owner | ✓ | ✓ | ✓ | ✓ | ✓ |
| manager | ✓ | ✓ | ✓ | ✓ | ✓ |
| staff | ✗ | ✓ | ✗ | ✗ | view only |
| kitchen | ✗ | ✓ only | ✗ | ✗ | ✗ |

---

## 10. Performance Targets (PRD §12 + §21.2)

| Metric | Target |
|--------|--------|
| TV-visible query (snapshot) | < 20ms (partial idx, 1k items) |
| PATCH item → TV 반영 | < 3s |
| 사진 transcode | < 10s |
| API p99 | < 300ms |
| Excel 100-item import (validate + execute) | < 60s |
| Featured rotation 풀 재평가 | < 100ms |
| Test coverage (unit) | ≥ 80% |

---

## 11. Sprint roadmap (12-week MVP)

| Sprint | 기간 | 산출 | Exit |
|--------|------|------|------|
| S0 | W0 | M01 컨텍스트 + Pickup 90→100% 시작 | 본 문서 + ANTI-M01 + sprint-0-checklist |
| S1 | W1-2 | DB 0010~0015 + Menu CRUD API | API curl test, coverage ≥80% |
| S2 | W3-4 | Media upload + 8개 WS event + Daypart cron | 24h WS 무중단 |
| S3 | W5-6 | Tablet 5 pages (Manual CRUD) | 5초 내 TV 반영 |
| S4 | W7-8 | TV 5-Zone + offline cache | KM2 Plus 24h soak |
| S5 | W9-10 | Excel import 8-step + 본인 매장 메뉴 이전 | 100-item < 60s |
| S6 | W11-12 | Polish + dogfooding 14일 + 베타 1곳 | P1 0건, 베타 계약 |

세부는 PRD §19.2~19.7 / Sprint 1 backlog (별도 표).

---

## 12. 절대 금지 (M01)

- 가격을 float/decimal로 저장 (BR-01 위반 — AM01-001)
- 4-value daypart enum 잔존 (Sprint 1 S1.3에서 additive 6-value로 묶음 패치 — enums.ts + schema.ts + migration 단일 commit)
- WS broadcast 전 DB commit 누락 (AM01-006)
- external_id를 store 간 unique로 검증 (AM01-003)
- 사진 transcode를 메인 API thread에서 처리 (AM01-005 — BullMQ 분리)
- Import 트랜잭션 분할 — 전체 1 tx 또는 row-level partial fail (AM01-004 / BR-31)
- 86 토글 일반 PATCH 권한과 동일하게 처리 — kitchen 허용 필요 (AM01-008)
- TV 클라이언트 daypart 계산을 UTC로 (AM01-007 — stores.timezone 필수)

---

## 13. Current Status
<!-- RS-MD-AUTO:current-status -->
- [2026-05-21] — Sprint F.C: TV 5-Zone layout + Featured rotation (BR-21) + cross-zone ticker 완료. **5-Zone (PRD §4)**: Zone A · Header (8%, daypart chip + WS status dot + clock) / Zone B · FeaturedBanner (22%, 8s cross-fade rotation) / Zone C · MenuGrid (~60%, 4-col category-tabbed) / Zone D · ZoneTicker (10%, M03 currentEvent.ticker_text 좌→우 24s loop, 비어 있으면 plain height-reserved). **tvStore 확장**: `featuredItems: MenuItemData[]` + `featuredRotationSeconds: 5|8|10|12` + `setFeaturedItems`/`setFeaturedRotationSeconds`. **App.tsx loadFeatured**: GET `/api/menu/featured/current?limit=8` → setFeaturedItems + setFeaturedRotationSeconds. Boot 시 function_type==='menu' 분기에서 menu + featured + events 모두 load. WS `display:featured_config_changed` / `display:full_refresh` 수신 시 loadFeatured 호출. **신규 components**: `apps/tv/src/components/menuboard/FeaturedBanner.tsx` (Animated cross-fade 700ms in/out, pagination dots, AG-014 Empty `TODAY'S MENU` placeholder) + `ZoneTicker.tsx` (좌→우 24s `Animated.loop`, ticker_text 없으면 plain height-reserved). **MenuBoardScreen rewrite**: ZoneHeader (daypart chip + ws status dot color) → FeaturedBanner → ZoneGrid (기존 catTabbed grid, dots를 카테고리 헤더로 이동) → ZoneTicker. **TV tsc clean**. M01 F.C 종결 — TV는 single-zone에서 5-Zone PRD spec 준수로 전환. 다음: M01 P1 SMOKE 3차 또는 M02 5-Zone 적용(M02는 Pickup 도메인이라 zone 기준 다름) 또는 결제 연동 (Stripe Connect).
- [2026-05-17] — v3 작성. PRD v1.2 전면 반영. Sprint 1 진입 대기.
- [2026-05-18] — Sprint 2 Track A+B 완료. Media upload BullMQ 분리(AG-022/AM01-005) + Snapshot/Cache endpoint(BR-03). migration 0014 + 12 invalidate sites + AM01-013 신규. 136/136 tests pass. `pnpm worker` 별 프로세스 운영.
- [2026-05-18] — Sprint 3 Page A `/menu` (Tablet) 완료. Sidebar(search+daypart+category) + 3-col grid + Add Item modal + optimistic 86 toggle + WS 실시간 갱신(AG-002). MenuCard photo_status 4상태 표시. AG-014/AG-020/AG-021 모두 준수. tsc clean. Edit page B + Photo upload UX는 Sprint 4 영역.
- [2026-05-19] — Sprint 4 S4.1 Page B `/menu/item/[id]` Basic 탭 완료. GET /api/menu/items/:id 신규(404 cross-store/soft-deleted 차단). 6탭 shell (Basic active, 5 placeholder). BasicTab: 5-lang 토글 + name/description i18n + category chip + priceCents(BR-01/25) + kitchen_name. Save mutation: diff 기반 PATCH dirty-only, optimistic list cache patch + rollback. 서버 invalidate→broadcast 순서(AM01-013) 그대로 사용. MenuCard onPress→push 라우팅. tsc clean. API 138/138 tests pass (+2 신규: GET /:id 401/404). Schedule/Allergens/Display/Modifiers/Ingredients 탭은 S4.2~S4.6.
- [2026-05-19] — Sprint 4 S4.2 Schedule 탭 완료. ScheduleTab: 6-Daypart multi-select (AG-013 정본) + LTO `available_from`/`available_until` ISO 8601 입력 + `+24h`/`+7d`/`Clear` 단축 버튼 + LTO 역전 inline error. `GET /api/menu/dayparts` 결합해 매장 timezone + windows hint 표시 (BR-02/AG-024). `ItemFormState = BasicFormState & ScheduleFormState`로 폼 상태 통합, `diffForm`이 dayparts_arr/available_from/available_until 동등 비교 포함. `MenuItemCreateInput`에 `available_from?: string|null`/`available_until?: string|null` 추가. tablet tsc clean · API 138/138 회귀 OK (server 변경 없음). 다음: S4.3 Allergens 탭.
- [2026-05-19] — Sprint 4 S4.3 Allergens 탭 완료. AllergensTab: FDA 9 multi-select (icon+label, AG-013 ALLERGEN 정본) + spice_level 5-segment (none/mild/medium/hot/extreme — heat 1~4 flame visual) + Clear spice link + calories integer input(kcal). `ItemFormState` += `AllergensFormState`(allergens, calories, spice_level). diffForm/mergeForOptimistic 셋 다 mirror. Tab ready=true. tablet tsc clean · API 138/138 회귀 OK (server 미변경 — PATCH 라우트가 이미 allergens/calories/spice_level cover). 다음: S4.4 Display 탭.
- [2026-05-19] — Sprint 4 S4.4 Display 탭 완료. DisplayTab: show_on_tv / is_featured / is_hot 토글 행 + sort_order ±1 stepper(BR-13) + kitchen_name(KDS). BR-15 안내(featured 1 slot, 서버 거부). PRD §3.2 정렬에 맞춰 kitchen_name을 BasicTab→DisplayTab으로 이동(BasicFormState에서 제거). `ItemFormState` += `DisplayFormState`. diffForm/mergeForOptimistic mirror. Tab ready=true. tablet tsc clean · API 138/138 회귀 OK (server 미변경 — PATCH 라우트가 is_featured/is_hot/show_on_tv/sort_order/kitchen_name 모두 cover). 다음: S4.5 Modifiers/Variants 탭 (v1.1 BR-16/17/18).
- [2026-05-19] — Sprint 4 S4.6 Ingredients 탭 완료 (Page B 6/6, P1.5 BR-19 prep). 신규 INGREDIENT_UNIT enum 9값(g/kg/ml/L/oz/lb/each/piece/dozen — text+CHECK constraint, AG-013 정본). migration 0016 menu_ingredients(stock_quantity numeric(12,3) + min_threshold + external_id partial unique) + 0017 menu_item_ingredients(recipe N:M, AG-018 (store_id,item_id,ingredient_id) unique, quantity numeric(10,3) CHECK>0). 신규 routes: `/api/menu/ingredients` GET/POST/PATCH/DELETE + PATCH /:id/stock-adjust(mode=set|delta, kitchen은 delta만 허용) + GET /items/:id/ingredients(join) + PUT /items/:id/recipe(전체 교체 1tx, BR-20 lock, INGREDIENT_IN_USE 409 guard). Zod schemas: IngredientCreate/Update/ListQuery, StockAdjust(discriminated union), RecipePut(중복 id refine). Tablet: IngredientsTab.tsx(local-draft + Save/Discard bar, unit cycler, ingredient picker chips, inline create-ingredient form, BR-20 lock 배너, AM01-018 web confirm) + 7 client 함수 + api.put 헬퍼. tests: 20 + 10 + 18 (unit + unit + integration) = 48 신규, **48/48 pass**. 전체 API 238/240(qr.test.ts 2건 pre-existing rate-limit, S4.6 무관). tablet tsc clean. Page B 6/6 완료 — 다음: Sprint 5 Excel import 또는 Page C/D 폴리시.
- [2026-05-19] — Sprint 4 polish: Page C `/menus/categories` + Page D `/menus/daypart` 완료. **Page C**: 5-lang name 토글 편집 + emoji icon + is_active 토글 + ↑/↓ reorder(BR-13, drag-drop 라이브러리 AG-017 미설치로 button 방식) + add/delete. BR-14 차단(409 CATEGORIES_IN_USE)은 서버에서 처리. **Page D**: 6-Daypart(all 제외 5개) HH:MM start/end 편집 + local validity check + Save/Discard bar + 매장 timezone 표시 + 겹침 검증(BR-09 서버 422). 둘 다 AG-014 4-state UI. **Navigation**: HeaderActions.tsx에 Categories/Dayparts 진입 버튼 추가(optional props, /menus index에서 router.push). 신규 client 함수: createCategory/patchCategory/deleteCategory/reorderCategories/updateDayparts. tablet tsc clean. API 회귀 0건(서버 미변경). 다음: Sprint 5 Excel Import 또는 Page F(Featured Rotation BR-21) / G(Combos BR-23).
- [2026-05-19] — Sprint 5A: Excel Import 백엔드 기반 완료 (PRD §3.5/§5.3). **신규 패키지**: exceljs (TR-039 승인). **migration 0018 menu_import_jobs** — IMPORT_SOURCE/IMPORT_STATUS text+CHECK + errors/preview jsonb + active partial unique(`status IN (pending,validating,preview_ready,executing)` — BR-33 동시 1job 강제). **3 endpoints**: GET `/api/menu/import/template` (xlsx 1-sheet items + README, BR-25 dollars→cents 안내) · POST `/api/menu/import/excel/upload` (multipart, BR-33 409, 415 .xlsx 외, 413 10MB 초과 → job_id 202 반환) · GET `/api/menu/import/jobs/:id` (status polling, raw_path 누출 차단). **BullMQ queue `menu-import`** (importQueue.ts) + **importWorker.ts** (별 프로세스, parse → row-by-row ImportRowSchema.safeParse → total/valid/invalid/errors/preview update → pending→validating→preview_ready/failed). NODE_ENV=test no-op 패턴. **Zod ImportRowSchema** — BR-25 transform (dollars→cents), 5-lang name, comma dayparts/allergens, spice_level optional. **ImportExecuteSchema** prep (mode lenient|strict, confirm:true — BR-30/31). RBAC: owner/manager only. **tests**: 10 unit (auth/RBAC/validation) + 5 integration (template DL parse / upload→job_id / BR-33 409 / 415) + 4 worker(all-valid/mixed/empty/spice) = **19 신규, 19/19 pass**. **전체 API 259/259** (qr.test.ts 이전 2 fail도 함께 통과). tsc clean. **5B 남은 작업**: errors CSV / preview / execute(트랜잭션) + 24h TTL cleanup. **5C**: Tablet Page E 8-step wizard UI.
- [2026-05-19] — Sprint 5B: Excel Import 실행(transaction) + errors CSV + preview 완료. **3 endpoints**: GET `/api/menu/import/jobs/:id/errors` (RFC 4180 CSV, `row,field,message`) · GET `/api/menu/import/jobs/:id/preview` (jsonb 그대로 반환) · POST `/api/menu/import/jobs/:id/execute` (RBAC owner/manager, BR-30 `confirm:true` required, BR-31 strict→invalid_rows>0 시 422 STRICT_MODE_HAS_ERRORS, INVALID_STATE 409 if not preview_ready). **Execute 트랜잭션**: status preview_ready → executing → completed/failed. 1 tx: ① category_en lookup-or-create (cache로 중복 query 방지, jsonb name->>'en' case-insensitive 매칭) ② menu_items insert (legacy `name` + `name_i18n` 동시, dayparts csv→array AG-013 정본 필터, allergens csv→array, price_usd는 ImportRowSchema에서 이미 cents 변환됨) ③ BR-26 external_id 있으면 upsert(update existing) — return {inserted, updated, skipped, mode}. AM01-013 invalidateSnapshot 후 `display:full_refresh` broadcast. raw_path unlink (BR-27 P1 cleanup; P2 R2 lifecycle). **tests**: 7 unit (auth/RBAC/validation) + 6 integration (strict 422 / lenient insert+category / external_id upsert / INVALID_STATE 409 / errors CSV / preview rows) = **13 신규, 13/13 pass**. **전체 API 272/272**. tsc clean. **5C**: Tablet Page E 8-step wizard UI (Sprint 5 마무리).
- [2026-05-19] — Sprint 5C: Tablet Page E `/menus/import` 8-step wizard 완료. **PRD §3.5 정본 8 steps**: Template DL → Fill(offline 안내) → Upload(web `input[type=file]` 분기, native는 P1.5) → Photos(P1.5 skip) → Validate(2s polling, status preview_ready/failed에서 자동 진행) → Errors CSV download → Preview + mode(lenient/strict) + `NOT reversible` checkbox(BR-30) + invalid_rows>0 strict 차단 → Execute 결과 요약(inserted/updated/skipped). **Stepper UI**: 8 dot + 7 connector, current/done/pending 3-state. **신규 client 함수**: downloadImportTemplate(Blob), uploadImportFile(multipart FormData → 직접 fetch), fetchImportJob, fetchImportPreview, downloadImportErrors(Blob), executeImport. saveBlob() helper(web: anchor click + revokeObjectURL, native: P1.5 expo-sharing). **Navigation**: HeaderActions.onImportWizard → router.push('/menus/import'). AG-014 4-state UI / AG-017 신규 패키지 0개. tablet tsc clean. **Sprint 5 (5A+5B+5C) 종결 — M01 P1 Excel Import D9 차별화 1차 출시 가능 상태**. 다음: M02 ttf 번들 마무리 또는 Page F(Featured Rotation BR-21).
- [2026-05-20] — SMOKE v2 누적 테스트 통과 (Sprint 4 polish + Sprint 5 + M02 ttf, commit f8e5ad8~). 사용자 브라우저 수동 시연 — 6.1 routing(탭 6개) / 6.2 Modifiers / 6.3 Ingredients / 6.4 Categories / 6.5 Daypart / 6.6 Import wizard 8-step / 6.7 Engineer Mode / 6.8 회귀 모두 OK. **발견 버그 6건 즉시 fix**: [AM01-019] list endpoint ORDER BY tie-break 없어 86 토글 후 카드 swap → 7개 endpoint(menu_items/categories/variants/modifier_groups/modifier_options/item_modifier_groups/item_ingredients/ingredients)에 `id` tiebreaker 일괄 추가. [AM01-020] `(tabs)/<folder>/_layout.tsx` 누락 시 sub-route가 별도 탭으로 노출 → menus/dashboard/events/tvs 4개 폴더에 Stack layout 추가. [AM01-021] `app/` 트리 안 `.test.tsx`가 라우트로 인식 → "missing default export" 콘솔 에러 → 3개 shim 제거. [AM01-022] RN `<View>` children에 빈 문자열 truthy 평가 → "Unexpected text node" → `Boolean()` 래핑. [AM01-023] 페이지 reload 시 useAuthStore hydrate 전 React Query refetch → 첫 페이지 401 노이즈(낮음, 동작 영향 X). [AM01-024] RN-Web 외부 라이브러리 deprecation(shadow*, pointerEvents) — 우리 책임 X 기록만. **UX 개선**: ModifiersTab / IngredientsTab 상단에 "자체 Save 버튼 사용" 안내 배너 추가(부모 Save와 분리된 endpoint 패턴 설명). 전체 API 272/272 회귀 통과. SMOKE-TEST.md v2 §6 추가. M01 P1 출시 직전 안정성 검증 완료.
- [2026-05-20] — Sprint G.B: Page G Combos Tablet UI `/menus/combos` 완료. **단일 페이지 (list + inline editor)**: 상단 카드 그리드(name + price + savings + items count + dayparts + 86/Featured/Hidden 뱃지) + "New combo" 버튼 → 카드 클릭 또는 New → 하단 editor open. **Editor**: name_en/desc_en 입력(5-lang은 P1.5 확장), Combo price USD(decimal→cents 변환), Sort order, BR-23 real-time summary($합계/콤보가/savings/할인%/⚠ exceeds 경고), Items section(picker — search existing menu_items + price 표시, used 제외, 무가격 항목 제외) → per-line qty stepper(1~99) + group_name chip(None/Main/Side/Drink/Dessert/Extra free-text) + substitutable checkbox(BR-18) + remove, Dayparts 6-value multi-select chip(AG-013), Show on TV/Featured/Sold out toggles. **Save 로직**: validation(name required / price > 0 / items ≥ 1 / no missing items / BR-23) → POST 또는 PATCH(items 포함 전체 교체) → React Query invalidate. **Delete**: confirm 후 soft delete. **신규 client 함수**: fetchCombos/fetchCombo/createCombo/patchCombo/deleteCombo + Combo / ComboItemLine / ComboCreateInput / ComboPatchInput types. **WS subscription**: `useMenuWsSubscription`에 `display:combo_updated` 추가 → `['menu','combos']` invalidate. **HeaderActions**에 onCombos prop + 📚 Combos 진입 버튼 추가 (menus/index.tsx 연결). AG-014 4-state UI(Loading/Empty/Error/Offline) / AM01-020 부모 _layout 활용(별도 layout 불필요) / AG-017 신규 패키지 0개. **Tablet tsc clean** · API 회귀 21/21 유지. **Sprint G.A+G.B 종결 — M01 P1 Combos D9 차별화 출시 가능 상태**. 다음: M02 5-Zone redesign(F.C TV Zone B와 묶음) 또는 M03 Event Board.
- [2026-05-20] — Sprint G.A: Page G Combos 백엔드 (PRD §4.2 Page G / §5.1 / BR-18/23) 완료. **2 신규 테이블**: `menu_combos`(jsonb name/desc i18n, price_cents, items_total_cents/savings_cents 캐시, dayparts_arr, is_sold_out/is_featured/show_on_tv, BR-05 soft delete) + `menu_combo_items`(N:M, AG-018 (store_id,combo_id,item_id) unique, quantity 1~99 CHECK, is_substitutable + group_name BR-18, item_id FK RESTRICT). **2 migration**: 0020_menu_combos.sql(price_cents>0 + savings invariant CHECK savings_cents = items_total_cents - price_cents) + 0021_menu_combo_items.sql. **5 endpoints** `/api/menu/combos`: GET list(daypart/status filter AG-021, sort_order+id tie-break AM01-019) · GET /:id(404 cross-store/soft-deleted) · POST(owner/manager, BR-23 enforce: price_cents ≤ Σ(item.price × qty) → 422 COMBO_PRICE_EXCEEDS_ITEMS_TOTAL, ITEMS_NOT_FOUND 422 if any item missing/cross-store/no price_cents, 1tx insert combo+items) · PATCH /:id(items 제공 시 전체 교체, price 또는 items 변경 시 BR-23 재검증, Zod validation 먼저 → DB 후 — 500 leak 방지) · DELETE /:id(soft delete). 모두 AM01-013 commit→invalidateSnapshot→broadcast 순서 준수. **WS event**: `display:combo_updated` 재사용(create/update/delete 통합 — payload combo.deleted_at으로 분기, broadcast.ts ALLOWED_EVENTS 기존 등록). **Zod schemas**: ComboCreateSchema(strict + items 1~20 + dup item_id refine) / ComboPatchSchema(전체 optional + at-least-one refine) / ComboItemLineSchema / ComboListQuerySchema. **AuditEntityType 'menu_combo'**는 기존 enum에 이미 존재. **tests**: 21 route test (auth 401 × 5 endpoint / RBAC 403 × 3 / Zod 422 × 13: empty name, price 0, empty items, dup item_id, invalid daypart, qty 0, >20 items, unknown field strict, PATCH empty body, PATCH negative price). **21/21 pass** + API tsc clean. DB-hit 회귀 34건은 Docker 미실행 환경 의존(menuFeatured/menuModifierGroups 등 사전 실패 동일 패턴), 본 변경 무관. **G.B (Tablet Page G /menus/combos UI)는 별도 sprint**: 콤보 리스트 + Create wizard(name/items picker/qty/group/substitutable) + BR-23 실시간 합계 표시 + Edit/Delete + HeaderActions Combos 진입 + WS subscription.
- [2026-05-20] — Sprint F.A+F.B: Page F `/menus/featured` (Featured Rotation BR-21) 완료. **신규 enum**: FEATURED_RULE_TYPE 6값(chef_pick/lto/low_inventory/daypart/analytics_star/analytics_puzzle — P1 active 3, P1.5/P2 stub 3) + FEATURED_ROTATION_SECONDS [5,8,10,12]. **migration 0019 menu_featured_rules** — (store_id, rule_type) AG-018 unique + CHECK enum + is_active/priority/params jsonb. + `stores.featured_rotation_seconds` int NOT NULL DEFAULT 8 CHECK (5,8,10,12). **신규 service** `services/menuFeatured.ts` — `computeCurrentDaypart`(stores.timezone 기준 6-value daypart, 'late' overnight 21:00→02:00 지원, AG-024) + `evaluateFeaturedPool`(chef_pick는 is_featured=true, lto는 available_until - now() ≤ threshold_days, daypart는 dayparts_arr && [current,all] overlap; 매칭 항목 max priority DESC + sort_order ASC + id ASC tie-break, sold_out/!show_on_tv/deleted 제외. 룰 0개면 chef_pick implicit active). **3 endpoints**: GET `/api/menu/featured/current?limit=` (TV/Tablet preview) · GET `/api/menu/featured/rules` (Page F) · PUT `/api/menu/featured/rules` (owner/manager, 전체 교체 1tx upsert+missing delete, AM01-013 invalidate→broadcast 순서 준수). **WS event 신규**: `display:featured_config_changed` (Tablet+TV-menu 양쪽 broadcast, AM01-014 패턴). **Zod**: FeaturedRulesPutSchema(rule_type 중복 422 refine + rotation_seconds literal union + priority 0~1000 + params strict — unknown field 422). **Tablet Page F**: 회전 preview(60s polling, 매장 timezone + current_daypart 표시, 매칭 rule 뱃지) + rule 토글 + lto threshold_days(1/2/3/7d chip) + interval picker(5/8/10/12s chip) + Save/Discard bar. P2 rule(analytics)는 disabled. **신규 client 함수**: fetchFeaturedRules/fetchFeaturedCurrent/putFeaturedRules. **WS subscription**: `useMenuWsSubscription`에 featured_config_changed 추가 → `['menu','featured']` invalidate. **HeaderActions**에 ⭐ Featured 진입 버튼 추가. **테스트**: 11 unit(computeCurrentDaypart: LA timezone 6 daypart + overnight + closed + wildcard + enum drift) + 11 route(auth/RBAC/validation: invalid rule_type, dup rule_type, invalid rotation_seconds=7, priority out-of-range, params strict unknown) = **22 신규, 22/22 pass**. tsc clean (API + Tablet). **F.C (TV Zone B rendering)는 M02 5-Zone 리디자인과 함께 별도 sprint 예정** — 현재 TV는 single-zone(MenuBoardScreen), Zone B 구현하려면 layout 큰 폭 교체 필요.

- [2026-05-18 02:34] — done · HANDOFF.md,anti-patterns/ANTI-M01.md,modules/CLAUDE-M01.md
- [2026-05-18 02:50] — done · HANDOFF.md,anti-patterns/ANTI-M01.md,modules/CLAUDE-M01.md
- [2026-05-18 02:54] — done · .claude/hooks/pre-edit-schema-check.sh,HANDOFF.md,TOOL-REVIEW.md
- [2026-05-18 03:00] — done · .claude/hooks/pre-edit-schema-check.sh,HANDOFF.md,TOOL-REVIEW.md
- [2026-05-18 03:37] — done · .claude/hooks/pre-edit-schema-check.sh,CLAUDE.md,HANDOFF.md
- [2026-05-18 03:43] — done · .claude/hooks/pre-edit-schema-check.sh,CLAUDE.md,HANDOFF.md
- [2026-05-18 03:51] — done · .claude/hooks/pre-edit-schema-check.sh,.gitignore,CLAUDE.md
- [2026-05-18 03:55] — done · .claude/hooks/pre-edit-schema-check.sh,.gitignore,CLAUDE.md
- [2026-05-18 04:42] — done · .claude/hooks/pre-edit-schema-check.sh,.gitignore,CLAUDE.md
- [2026-05-18 04:50] — done · .claude/hooks/pre-edit-schema-check.sh,.gitignore,CLAUDE.md
- [2026-05-18 05:44] — done · .claude/hooks/pre-edit-schema-check.sh,.gitignore,CLAUDE.md
- [2026-05-18 05:49] — done · .claude/hooks/pre-edit-schema-check.sh,.gitignore,CLAUDE.md
- [2026-05-18 05:58] — done · .claude/hooks/pre-edit-schema-check.sh,.gitignore,CLAUDE.md
- [2026-05-18 06:03] — done · .claude/hooks/pre-edit-schema-check.sh,.gitignore,CLAUDE.md
- [2026-05-18 06:10] — done · .claude/hooks/pre-edit-schema-check.sh,.gitignore,CLAUDE.md
- [2026-05-18 06:21] — done · .claude/hooks/pre-edit-schema-check.sh,.gitignore,CLAUDE.md
- [2026-05-18 06:25] — done · .claude/hooks/pre-edit-schema-check.sh,.gitignore,CLAUDE.md
- [2026-05-18 06:37] — done · (no git changes)
- [2026-05-19 02:03] — done · (no git changes)
- [2026-05-19 03:02] — done · .env.example,anti-patterns/ANTI-M01.md,apps/api/package.json
- [2026-05-19 05:08] — done · .env.example,HANDOFF.md,anti-patterns/ANTI-M01.md
- [2026-05-19 06:13] — done · (no git changes)
- [2026-05-19 06:51] — done · HANDOFF.md,apps/api/src/routes/menu.test.ts,apps/api/src/routes/menu.ts
- [2026-05-19 07:06] — done · HANDOFF.md,apps/api/src/routes/menu.test.ts,apps/api/src/routes/menu.ts
- [2026-05-19 07:14] — done · HANDOFF.md,apps/api/src/routes/menu.test.ts,apps/api/src/routes/menu.ts
- [2026-05-19 13:23] — done · HANDOFF.md,apps/api/src/routes/menu.test.ts,apps/api/src/routes/menu.ts
- [2026-05-19 13:30] — done · HANDOFF.md,apps/api/src/routes/menu.test.ts,apps/api/src/routes/menu.ts
- [2026-05-19 13:32] — done · HANDOFF.md,apps/api/src/routes/menu.test.ts,apps/api/src/routes/menu.ts
- [2026-05-19 13:41] — done · (no git changes)
- [2026-05-19 13:44] — done · modules/CLAUDE-M01.md
- [2026-05-19 13:47] — done · modules/CLAUDE-M01.md
- [2026-05-19 13:57] — done · (no git changes)
- [2026-05-19 15:55] — done · modules/CLAUDE-M01.md
- [2026-05-19 16:13] — done · modules/CLAUDE-M01.md
- [2026-05-19 16:36] — done · modules/CLAUDE-M01.md
- [2026-05-19 16:39] — done · modules/CLAUDE-M01.md
- [2026-05-19 16:40] — done · modules/CLAUDE-M01.md
- [2026-05-19 16:56] — done · anti-patterns/ANTI-M01.md,apps/api/src/routes/menu.ts,apps/api/src/routes/menuCategories.ts
- [2026-05-19 17:04] — done · anti-patterns/ANTI-M01.md,apps/api/src/routes/menu.ts,apps/api/src/routes/menuCategories.ts
- [2026-05-19 17:12] — done · anti-patterns/ANTI-M01.md,apps/api/src/routes/menu.ts,apps/api/src/routes/menuCategories.ts
- [2026-05-19 17:16] — done · anti-patterns/ANTI-M01.md,apps/api/src/routes/menu.ts,apps/api/src/routes/menuCategories.ts
- [2026-05-19 17:28] — done · anti-patterns/ANTI-M01.md,apps/api/src/routes/menu.ts,apps/api/src/routes/menuCategories.ts
- [2026-05-19 17:37] — done · anti-patterns/ANTI-M01.md,apps/api/src/routes/menu.ts,apps/api/src/routes/menuCategories.ts
- [2026-05-19 17:42] — done · anti-patterns/ANTI-M01.md,apps/api/src/routes/menu.ts,apps/api/src/routes/menuCategories.ts
- [2026-05-19 17:46] — done · anti-patterns/ANTI-M01.md,apps/api/src/routes/menu.ts,apps/api/src/routes/menuCategories.ts
- [2026-05-19 17:54] — done · anti-patterns/ANTI-M01.md,apps/api/src/routes/menu.ts,apps/api/src/routes/menuCategories.ts
- [2026-05-19 17:55] — done · anti-patterns/ANTI-M01.md,apps/api/src/routes/menu.ts,apps/api/src/routes/menuCategories.ts
- [2026-05-19 17:58] — done · anti-patterns/ANTI-M01.md,apps/api/src/routes/menu.ts,apps/api/src/routes/menuCategories.ts
- [2026-05-19 18:05] — done · anti-patterns/ANTI-M01.md,apps/api/src/routes/menu.ts,apps/api/src/routes/menuCategories.ts
- [2026-05-19 18:24] — done · anti-patterns/ANTI-M01.md,apps/api/src/routes/menu.ts,apps/api/src/routes/menuCategories.ts
- [2026-05-19 18:31] — done · anti-patterns/ANTI-M01.md,apps/api/src/routes/menu.ts,apps/api/src/routes/menuCategories.ts
- [2026-05-19 19:05] — done · (no git changes)
- [2026-05-19 19:07] — done · modules/CLAUDE-M01.md
- [2026-05-19 20:06] — done · HANDOFF.md,apps/api/src/e2e/e2e.test.ts,modules/CLAUDE-M01.md
- [2026-05-19 20:19] — done · HANDOFF.md,apps/api/src/e2e/e2e.test.ts,apps/api/src/schemas/menu.ts
- [2026-05-19 20:29] — done · HANDOFF.md,apps/api/src/e2e/e2e.test.ts,apps/api/src/schemas/menu.ts
- [2026-05-19 20:37] — done · HANDOFF.md,apps/api/src/e2e/e2e.test.ts,apps/api/src/schemas/menu.ts
- [2026-05-19 20:55] — done · HANDOFF.md,apps/api/src/e2e/e2e.test.ts,apps/api/src/schemas/menu.ts
- [2026-05-19 21:02] — done · HANDOFF.md,apps/api/src/e2e/e2e.test.ts,apps/api/src/schemas/menu.ts
- [2026-05-19 21:15] — done · (no git changes)
- [2026-05-19 21:26] — done · HANDOFF.md,modules/CLAUDE-M01.md
- [2026-05-19 22:05] — done · HANDOFF.md,apps/api/src/db/migrations/meta/_journal.json,apps/api/src/db/schema.ts
- [2026-05-19 22:06] — done · HANDOFF.md,apps/api/src/db/migrations/meta/_journal.json,apps/api/src/db/schema.ts
- [2026-05-19 22:16] — done · HANDOFF.md,apps/api/src/db/migrations/meta/_journal.json,apps/api/src/db/schema.ts
- [2026-05-20 02:08] — done · (no git changes)
- [2026-05-20 02:42] — done · modules/CLAUDE-M01.md
- [2026-05-20 03:09] — done · (no git changes)
- [2026-05-20 03:16] — done · modules/CLAUDE-M01.md
- [2026-05-20 03:27] — done · modules/CLAUDE-M01.md
- [2026-05-20 03:47] — done · modules/CLAUDE-M01.md
- [2026-05-20 03:53] — done · modules/CLAUDE-M01.md
- [2026-05-20 04:09] — done · modules/CLAUDE-M01.md
- [2026-05-20 06:00] — done · (no git changes)
- [2026-05-20 06:05] — done · SMOKE-TEST.md,modules/CLAUDE-M01.md
- [2026-05-20 06:06] — done · SMOKE-TEST.md,modules/CLAUDE-M01.md
- [2026-05-20 06:09] — done · SMOKE-TEST.md,modules/CLAUDE-M01.md
- [2026-05-20 06:16] — done · SMOKE-TEST.md,modules/CLAUDE-M01.md
- [2026-05-20 06:24] — done · SMOKE-TEST.md,apps/tablet/app/(tabs)/menus/categories/index.test.tsx,apps/tablet/app/(tabs)/menus/daypart/index.test.tsx
- [2026-05-20 06:30] — done · SMOKE-TEST.md,apps/tablet/app/(tabs)/menus/categories/index.test.tsx,apps/tablet/app/(tabs)/menus/daypart/index.test.tsx
- [2026-05-20 06:35] — done · SMOKE-TEST.md,apps/tablet/app/(tabs)/menus/categories/index.test.tsx,apps/tablet/app/(tabs)/menus/daypart/index.test.tsx
- [2026-05-20 06:44] — done · SMOKE-TEST.md,apps/tablet/app/(tabs)/menus/categories/index.test.tsx,apps/tablet/app/(tabs)/menus/daypart/index.test.tsx
- [2026-05-20 06:48] — done · SMOKE-TEST.md,apps/tablet/app/(tabs)/menus/categories/index.test.tsx,apps/tablet/app/(tabs)/menus/daypart/index.test.tsx
- [2026-05-20 06:49] — done · SMOKE-TEST.md,apps/tablet/app/(tabs)/menus/categories/index.test.tsx,apps/tablet/app/(tabs)/menus/daypart/index.test.tsx
- [2026-05-20 06:50] — done · SMOKE-TEST.md,apps/tablet/app/(tabs)/menus/categories/index.test.tsx,apps/tablet/app/(tabs)/menus/daypart/index.test.tsx
- [2026-05-20 06:58] — done · SMOKE-TEST.md,apps/tablet/app/(tabs)/menus/categories/index.test.tsx,apps/tablet/app/(tabs)/menus/daypart/index.test.tsx
- [2026-05-20 07:05] — done · SMOKE-TEST.md,apps/tablet/app/(tabs)/menus/categories/index.test.tsx,apps/tablet/app/(tabs)/menus/daypart/index.test.tsx
- [2026-05-20 07:15] — done · SMOKE-TEST.md,apps/tablet/app/(tabs)/menus/categories/index.test.tsx,apps/tablet/app/(tabs)/menus/daypart/index.test.tsx
- [2026-05-20 22:20] — done · SMOKE-TEST.md,apps/api/src/routes/menu.ts,apps/api/src/routes/menuCategories.ts
- [2026-05-20 22:36] — done · (no git changes)
- [2026-05-20 23:29] — done · (no git changes)
- [2026-05-20 23:31] — done · modules/CLAUDE-M01.md
- [2026-05-20 23:44] — done · HANDOFF.md,apps/api/src/db/migrations/meta/_journal.json,apps/api/src/db/schema.ts
- [2026-05-20 23:52] — done · HANDOFF.md,apps/api/src/db/migrations/meta/_journal.json,apps/api/src/db/schema.ts
- [2026-05-21 01:37] — done · (no git changes)
- [2026-05-21 01:47] — done · (no git changes)
- [2026-05-21 01:52] — done · modules/CLAUDE-M01.md
- [2026-05-21 05:19] — done · modules/CLAUDE-M01.md
- [2026-05-21 05:39] — done · modules/CLAUDE-M01.md
- [2026-05-21 16:04] — done · modules/CLAUDE-M01.md
- [2026-05-21 16:06] — done · HANDOFF.md,modules/CLAUDE-M01.md
- [2026-05-22 04:09] — done · HANDOFF.md,modules/CLAUDE-M01.md
- [2026-05-22 04:20] — done · HANDOFF.md,modules/CLAUDE-M01.md
- [2026-05-22 04:36] — done · HANDOFF.md,anti-patterns/ANTI-M01.md,apps/tablet/app/(tabs)/menus/categories/index.tsx
- [2026-05-22 04:44] — done · HANDOFF.md,anti-patterns/ANTI-M01.md,apps/tablet/app/(tabs)/menus/categories/index.tsx
- [2026-05-22 06:40] — done · HANDOFF.md,anti-patterns/ANTI-M01.md,apps/tablet/app/(tabs)/menus/categories/index.tsx
- [2026-05-22 06:45] — done · HANDOFF.md,anti-patterns/ANTI-M01.md,apps/tablet/app/(tabs)/menus/categories/index.tsx
- [2026-05-22 06:51] — done · HANDOFF.md,anti-patterns/ANTI-M01.md,apps/tablet/app/(tabs)/menus/categories/index.tsx
- [2026-05-22 06:54] — done · HANDOFF.md,anti-patterns/ANTI-M01.md,apps/tablet/app/(tabs)/menus/categories/index.tsx
- [2026-05-22 06:59] — done · HANDOFF.md,anti-patterns/ANTI-M01.md,apps/tablet/app/(tabs)/menus/categories/index.tsx
- [2026-05-22 07:04] — done · HANDOFF.md,anti-patterns/ANTI-M01.md,apps/tablet/app/(tabs)/menus/categories/index.tsx
- [2026-05-22 07:17] — done · HANDOFF.md,anti-patterns/ANTI-M01.md,apps/tablet/app/(tabs)/menus/categories/index.tsx
- [2026-05-22 07:19] — done · HANDOFF.md,anti-patterns/ANTI-M01.md,apps/tablet/app/(tabs)/menus/categories/index.tsx
- [2026-05-22 07:23] — done · HANDOFF.md,anti-patterns/ANTI-M01.md,apps/tablet/app/(tabs)/menus/categories/index.tsx
- [2026-05-22 07:27] — done · HANDOFF.md,anti-patterns/ANTI-M01.md,apps/tablet/app/(tabs)/menus/categories/index.tsx
- [2026-05-22 07:34] — done · HANDOFF.md,anti-patterns/ANTI-M01.md,apps/tablet/app/(tabs)/menus/categories/index.tsx
- [2026-05-22 07:41] — done · HANDOFF.md,anti-patterns/ANTI-M01.md,apps/tablet/app/(tabs)/menus/categories/index.tsx
- [2026-05-22 07:47] — done · HANDOFF.md,anti-patterns/ANTI-M01.md,apps/tablet/app/(tabs)/menus/categories/index.tsx
- [2026-05-22 08:00] — done · HANDOFF.md,anti-patterns/ANTI-M01.md,apps/tablet/app/(tabs)/menus/categories/index.tsx
- [2026-05-22 13:58] — done · HANDOFF.md,anti-patterns/ANTI-M01.md,apps/tablet/app/(tabs)/menus/categories/index.tsx
- [2026-05-23 06:24] — done · HANDOFF.md,anti-patterns/ANTI-M01.md,apps/tablet/app/(tabs)/menus/categories/index.tsx
- [2026-05-23 06:31] — done · apps/tv/babel.config.js,apps/tv/package.json,pnpm-lock.yaml
- [2026-05-23 07:49] — done · (no git changes)
- [2026-05-23 07:52] — done · modules/CLAUDE-M01.md
- [2026-05-23 07:57] — done · (no git changes)
- [2026-05-23 08:00] — done · HANDOFF.md,modules/CLAUDE-M01.md
- [2026-05-23 08:01] — done · HANDOFF.md,modules/CLAUDE-M01.md
## Current Status
<!-- RS-MD-AUTO:current-status -->
- [2026-05-18 02:34] — done · HANDOFF.md,anti-patterns/ANTI-M01.md,modules/CLAUDE-M01.md
- [2026-05-18 02:50] — done · HANDOFF.md,anti-patterns/ANTI-M01.md,modules/CLAUDE-M01.md
- [2026-05-18 02:54] — done · .claude/hooks/pre-edit-schema-check.sh,HANDOFF.md,TOOL-REVIEW.md
- [2026-05-18 03:00] — done · .claude/hooks/pre-edit-schema-check.sh,HANDOFF.md,TOOL-REVIEW.md
- [2026-05-18 03:37] — done · .claude/hooks/pre-edit-schema-check.sh,CLAUDE.md,HANDOFF.md
- [2026-05-18 03:43] — done · .claude/hooks/pre-edit-schema-check.sh,CLAUDE.md,HANDOFF.md
- [2026-05-18 03:51] — done · .claude/hooks/pre-edit-schema-check.sh,.gitignore,CLAUDE.md
- [2026-05-18 03:55] — done · .claude/hooks/pre-edit-schema-check.sh,.gitignore,CLAUDE.md
- [2026-05-18 04:42] — done · .claude/hooks/pre-edit-schema-check.sh,.gitignore,CLAUDE.md
- [2026-05-18 04:50] — done · .claude/hooks/pre-edit-schema-check.sh,.gitignore,CLAUDE.md
- [2026-05-18 05:44] — done · .claude/hooks/pre-edit-schema-check.sh,.gitignore,CLAUDE.md
- [2026-05-18 05:49] — done · .claude/hooks/pre-edit-schema-check.sh,.gitignore,CLAUDE.md
- [2026-05-18 05:58] — done · .claude/hooks/pre-edit-schema-check.sh,.gitignore,CLAUDE.md
- [2026-05-18 06:03] — done · .claude/hooks/pre-edit-schema-check.sh,.gitignore,CLAUDE.md
- [2026-05-18 06:10] — done · .claude/hooks/pre-edit-schema-check.sh,.gitignore,CLAUDE.md
- [2026-05-18 06:21] — done · .claude/hooks/pre-edit-schema-check.sh,.gitignore,CLAUDE.md
- [2026-05-18 06:25] — done · .claude/hooks/pre-edit-schema-check.sh,.gitignore,CLAUDE.md
- [2026-05-18 06:37] — done · (no git changes)
- [2026-05-19 02:03] — done · (no git changes)
- [2026-05-19 03:02] — done · .env.example,anti-patterns/ANTI-M01.md,apps/api/package.json
- [2026-05-19 05:08] — done · .env.example,HANDOFF.md,anti-patterns/ANTI-M01.md
- [2026-05-19 06:13] — done · (no git changes)
- [2026-05-19 06:51] — done · HANDOFF.md,apps/api/src/routes/menu.test.ts,apps/api/src/routes/menu.ts
- [2026-05-19 07:06] — done · HANDOFF.md,apps/api/src/routes/menu.test.ts,apps/api/src/routes/menu.ts
- [2026-05-19 07:14] — done · HANDOFF.md,apps/api/src/routes/menu.test.ts,apps/api/src/routes/menu.ts
- [2026-05-19 13:23] — done · HANDOFF.md,apps/api/src/routes/menu.test.ts,apps/api/src/routes/menu.ts
- [2026-05-19 13:30] — done · HANDOFF.md,apps/api/src/routes/menu.test.ts,apps/api/src/routes/menu.ts
- [2026-05-19 13:32] — done · HANDOFF.md,apps/api/src/routes/menu.test.ts,apps/api/src/routes/menu.ts
- [2026-05-19 13:41] — done · (no git changes)
- [2026-05-19 13:44] — done · modules/CLAUDE-M01.md
- [2026-05-19 13:47] — done · modules/CLAUDE-M01.md
- [2026-05-19 13:57] — done · (no git changes)
- [2026-05-19 15:55] — done · modules/CLAUDE-M01.md
- [2026-05-19 16:13] — done · modules/CLAUDE-M01.md
- [2026-05-19 16:36] — done · modules/CLAUDE-M01.md
- [2026-05-19 16:39] — done · modules/CLAUDE-M01.md
- [2026-05-19 16:40] — done · modules/CLAUDE-M01.md
- [2026-05-19 16:56] — done · anti-patterns/ANTI-M01.md,apps/api/src/routes/menu.ts,apps/api/src/routes/menuCategories.ts
- [2026-05-19 17:04] — done · anti-patterns/ANTI-M01.md,apps/api/src/routes/menu.ts,apps/api/src/routes/menuCategories.ts
- [2026-05-19 17:12] — done · anti-patterns/ANTI-M01.md,apps/api/src/routes/menu.ts,apps/api/src/routes/menuCategories.ts
- [2026-05-19 17:16] — done · anti-patterns/ANTI-M01.md,apps/api/src/routes/menu.ts,apps/api/src/routes/menuCategories.ts
- [2026-05-19 17:28] — done · anti-patterns/ANTI-M01.md,apps/api/src/routes/menu.ts,apps/api/src/routes/menuCategories.ts
- [2026-05-19 17:37] — done · anti-patterns/ANTI-M01.md,apps/api/src/routes/menu.ts,apps/api/src/routes/menuCategories.ts
- [2026-05-19 17:42] — done · anti-patterns/ANTI-M01.md,apps/api/src/routes/menu.ts,apps/api/src/routes/menuCategories.ts
- [2026-05-19 17:46] — done · anti-patterns/ANTI-M01.md,apps/api/src/routes/menu.ts,apps/api/src/routes/menuCategories.ts
- [2026-05-19 17:54] — done · anti-patterns/ANTI-M01.md,apps/api/src/routes/menu.ts,apps/api/src/routes/menuCategories.ts
- [2026-05-19 17:55] — done · anti-patterns/ANTI-M01.md,apps/api/src/routes/menu.ts,apps/api/src/routes/menuCategories.ts
- [2026-05-19 17:58] — done · anti-patterns/ANTI-M01.md,apps/api/src/routes/menu.ts,apps/api/src/routes/menuCategories.ts
- [2026-05-19 18:05] — done · anti-patterns/ANTI-M01.md,apps/api/src/routes/menu.ts,apps/api/src/routes/menuCategories.ts
- [2026-05-19 18:24] — done · anti-patterns/ANTI-M01.md,apps/api/src/routes/menu.ts,apps/api/src/routes/menuCategories.ts
- [2026-05-19 18:31] — done · anti-patterns/ANTI-M01.md,apps/api/src/routes/menu.ts,apps/api/src/routes/menuCategories.ts
- [2026-05-19 19:05] — done · (no git changes)
- [2026-05-19 19:07] — done · modules/CLAUDE-M01.md
- [2026-05-19 20:06] — done · HANDOFF.md,apps/api/src/e2e/e2e.test.ts,modules/CLAUDE-M01.md
- [2026-05-19 20:19] — done · HANDOFF.md,apps/api/src/e2e/e2e.test.ts,apps/api/src/schemas/menu.ts
- [2026-05-19 20:29] — done · HANDOFF.md,apps/api/src/e2e/e2e.test.ts,apps/api/src/schemas/menu.ts
- [2026-05-19 20:37] — done · HANDOFF.md,apps/api/src/e2e/e2e.test.ts,apps/api/src/schemas/menu.ts
- [2026-05-19 20:55] — done · HANDOFF.md,apps/api/src/e2e/e2e.test.ts,apps/api/src/schemas/menu.ts
- [2026-05-19 21:02] — done · HANDOFF.md,apps/api/src/e2e/e2e.test.ts,apps/api/src/schemas/menu.ts
- [2026-05-19 21:15] — done · (no git changes)
- [2026-05-19 21:26] — done · HANDOFF.md,modules/CLAUDE-M01.md
- [2026-05-19 22:05] — done · HANDOFF.md,apps/api/src/db/migrations/meta/_journal.json,apps/api/src/db/schema.ts
- [2026-05-19 22:06] — done · HANDOFF.md,apps/api/src/db/migrations/meta/_journal.json,apps/api/src/db/schema.ts
- [2026-05-19 22:16] — done · HANDOFF.md,apps/api/src/db/migrations/meta/_journal.json,apps/api/src/db/schema.ts
- [2026-05-20 02:08] — done · (no git changes)
- [2026-05-20 02:42] — done · modules/CLAUDE-M01.md
- [2026-05-20 03:09] — done · (no git changes)
- [2026-05-20 03:16] — done · modules/CLAUDE-M01.md
- [2026-05-20 03:27] — done · modules/CLAUDE-M01.md
- [2026-05-20 03:47] — done · modules/CLAUDE-M01.md
- [2026-05-20 03:53] — done · modules/CLAUDE-M01.md
- [2026-05-20 04:09] — done · modules/CLAUDE-M01.md
- [2026-05-20 06:00] — done · (no git changes)
- [2026-05-20 06:05] — done · SMOKE-TEST.md,modules/CLAUDE-M01.md
- [2026-05-20 06:06] — done · SMOKE-TEST.md,modules/CLAUDE-M01.md
- [2026-05-20 06:09] — done · SMOKE-TEST.md,modules/CLAUDE-M01.md
- [2026-05-20 06:16] — done · SMOKE-TEST.md,modules/CLAUDE-M01.md
- [2026-05-20 06:24] — done · SMOKE-TEST.md,apps/tablet/app/(tabs)/menus/categories/index.test.tsx,apps/tablet/app/(tabs)/menus/daypart/index.test.tsx
- [2026-05-20 06:30] — done · SMOKE-TEST.md,apps/tablet/app/(tabs)/menus/categories/index.test.tsx,apps/tablet/app/(tabs)/menus/daypart/index.test.tsx
- [2026-05-20 06:35] — done · SMOKE-TEST.md,apps/tablet/app/(tabs)/menus/categories/index.test.tsx,apps/tablet/app/(tabs)/menus/daypart/index.test.tsx
- [2026-05-20 06:44] — done · SMOKE-TEST.md,apps/tablet/app/(tabs)/menus/categories/index.test.tsx,apps/tablet/app/(tabs)/menus/daypart/index.test.tsx
- [2026-05-20 06:48] — done · SMOKE-TEST.md,apps/tablet/app/(tabs)/menus/categories/index.test.tsx,apps/tablet/app/(tabs)/menus/daypart/index.test.tsx
- [2026-05-20 06:49] — done · SMOKE-TEST.md,apps/tablet/app/(tabs)/menus/categories/index.test.tsx,apps/tablet/app/(tabs)/menus/daypart/index.test.tsx
- [2026-05-20 06:50] — done · SMOKE-TEST.md,apps/tablet/app/(tabs)/menus/categories/index.test.tsx,apps/tablet/app/(tabs)/menus/daypart/index.test.tsx
- [2026-05-20 06:58] — done · SMOKE-TEST.md,apps/tablet/app/(tabs)/menus/categories/index.test.tsx,apps/tablet/app/(tabs)/menus/daypart/index.test.tsx
- [2026-05-20 07:05] — done · SMOKE-TEST.md,apps/tablet/app/(tabs)/menus/categories/index.test.tsx,apps/tablet/app/(tabs)/menus/daypart/index.test.tsx
- [2026-05-20 07:15] — done · SMOKE-TEST.md,apps/tablet/app/(tabs)/menus/categories/index.test.tsx,apps/tablet/app/(tabs)/menus/daypart/index.test.tsx
- [2026-05-20 22:20] — done · SMOKE-TEST.md,apps/api/src/routes/menu.ts,apps/api/src/routes/menuCategories.ts
- [2026-05-20 22:36] — done · (no git changes)
- [2026-05-20 23:29] — done · (no git changes)
- [2026-05-20 23:31] — done · modules/CLAUDE-M01.md
- [2026-05-20 23:44] — done · HANDOFF.md,apps/api/src/db/migrations/meta/_journal.json,apps/api/src/db/schema.ts
- [2026-05-20 23:52] — done · HANDOFF.md,apps/api/src/db/migrations/meta/_journal.json,apps/api/src/db/schema.ts
- [2026-05-21 01:37] — done · (no git changes)
- [2026-05-21 01:47] — done · (no git changes)
- [2026-05-21 01:52] — done · modules/CLAUDE-M01.md
- [2026-05-21 05:19] — done · modules/CLAUDE-M01.md
- [2026-05-21 05:39] — done · modules/CLAUDE-M01.md
- [2026-05-21 16:04] — done · modules/CLAUDE-M01.md
- [2026-05-21 16:06] — done · HANDOFF.md,modules/CLAUDE-M01.md
- [2026-05-22 04:09] — done · HANDOFF.md,modules/CLAUDE-M01.md
- [2026-05-22 04:20] — done · HANDOFF.md,modules/CLAUDE-M01.md
- [2026-05-22 04:36] — done · HANDOFF.md,anti-patterns/ANTI-M01.md,apps/tablet/app/(tabs)/menus/categories/index.tsx
- [2026-05-22 04:44] — done · HANDOFF.md,anti-patterns/ANTI-M01.md,apps/tablet/app/(tabs)/menus/categories/index.tsx
- [2026-05-22 06:40] — done · HANDOFF.md,anti-patterns/ANTI-M01.md,apps/tablet/app/(tabs)/menus/categories/index.tsx
- [2026-05-22 06:45] — done · HANDOFF.md,anti-patterns/ANTI-M01.md,apps/tablet/app/(tabs)/menus/categories/index.tsx
- [2026-05-22 06:51] — done · HANDOFF.md,anti-patterns/ANTI-M01.md,apps/tablet/app/(tabs)/menus/categories/index.tsx
- [2026-05-22 06:54] — done · HANDOFF.md,anti-patterns/ANTI-M01.md,apps/tablet/app/(tabs)/menus/categories/index.tsx
- [2026-05-22 06:59] — done · HANDOFF.md,anti-patterns/ANTI-M01.md,apps/tablet/app/(tabs)/menus/categories/index.tsx
- [2026-05-22 07:04] — done · HANDOFF.md,anti-patterns/ANTI-M01.md,apps/tablet/app/(tabs)/menus/categories/index.tsx
- [2026-05-22 07:17] — done · HANDOFF.md,anti-patterns/ANTI-M01.md,apps/tablet/app/(tabs)/menus/categories/index.tsx
- [2026-05-22 07:19] — done · HANDOFF.md,anti-patterns/ANTI-M01.md,apps/tablet/app/(tabs)/menus/categories/index.tsx
- [2026-05-22 07:23] — done · HANDOFF.md,anti-patterns/ANTI-M01.md,apps/tablet/app/(tabs)/menus/categories/index.tsx
- [2026-05-22 07:27] — done · HANDOFF.md,anti-patterns/ANTI-M01.md,apps/tablet/app/(tabs)/menus/categories/index.tsx
- [2026-05-22 07:34] — done · HANDOFF.md,anti-patterns/ANTI-M01.md,apps/tablet/app/(tabs)/menus/categories/index.tsx
- [2026-05-22 07:41] — done · HANDOFF.md,anti-patterns/ANTI-M01.md,apps/tablet/app/(tabs)/menus/categories/index.tsx
- [2026-05-22 07:47] — done · HANDOFF.md,anti-patterns/ANTI-M01.md,apps/tablet/app/(tabs)/menus/categories/index.tsx
- [2026-05-22 08:00] — done · HANDOFF.md,anti-patterns/ANTI-M01.md,apps/tablet/app/(tabs)/menus/categories/index.tsx
- [2026-05-22 13:58] — done · HANDOFF.md,anti-patterns/ANTI-M01.md,apps/tablet/app/(tabs)/menus/categories/index.tsx
- [2026-05-23 06:24] — done · HANDOFF.md,anti-patterns/ANTI-M01.md,apps/tablet/app/(tabs)/menus/categories/index.tsx
- [2026-05-23 06:31] — done · apps/tv/babel.config.js,apps/tv/package.json,pnpm-lock.yaml
- [2026-05-23 07:49] — done · (no git changes)
- [2026-05-23 07:52] — done · modules/CLAUDE-M01.md
- [2026-05-23 07:57] — done · (no git changes)
- [2026-05-23 08:00] — done · HANDOFF.md,modules/CLAUDE-M01.md
- [2026-05-23 08:01] — done · HANDOFF.md,modules/CLAUDE-M01.md
