# Sprint 1 Backlog — M01 Menu Module · DB Schema + Core API
> Week 1-2 · Total ~97h (capacity 1.5 dev × 2w ≈ 120h)
> Source: PRD-M01-Menu-Module-v1.2.md §19.2

## Pre-flight (Sprint 0 Exit 미충족 시 진입 금지)
- [ ] `modules/CLAUDE-M01.md` v3 로드 가능
- [ ] `anti-patterns/ANTI-M01.md` 8 시드 항목 확정
- [x] `.claude/hooks/pre-edit-schema-check.sh` v4 — additive 6-value 허용 + 변형값(`brunch/late_night/morning/evening/all_day/closed`) 차단 (2026-05-17 시연)
- [ ] Subagents 가동: `@db-architect`, `@backend-dev`, `@test-writer`, `@reviewer`
- [ ] staging DB 백업 timestamp 기록
- [ ] M02 Pickup dogfooding 시작 (병행)

## Tasks

| ID | Task | Owner | Hours | Deps | Exit criteria |
|----|------|-------|-------|------|---------------|
| S1.1 | Migration 0010 `menu_categories` (store_id, name jsonb, icon, sort_order, is_active, external_id) | @db-architect | 4 | — | drizzle-kit generate + push staging OK |
| S1.2 | Migration 0011 `menu_items` 확장 (i18n jsonb, dayparts text[], allergens text[], price_cents, has_variants, has_modifiers, tax_*, sync_*, external_id, import_job_id, import_source) | @db-architect | 6 | S1.1 | EXPLAIN existing query 회귀 없음 |
| S1.3 | Migration 0006_daypart_add_snack_late + enums.ts + schema.ts pgEnum **단일 commit** (additive 6-value: snack/late 추가, breakfast/lunch/dinner/all 보존) + `stores.daypart_windows jsonb` + Migration 0012 `menu_dayparts` | @db-architect | 5 | — | `ALTER TYPE daypart ADD VALUE` 적용, 기존 row 0 변경 검증, tsc clean |
| S1.4 | Migration 0013 `menu_audit_log` (operation, before/after jsonb, user_id, store_id, ts) | @db-architect | 4 | — | append-only, partial idx (store_id, ts) |
| S1.5 | Migration 0014 `stores` 확장 (default_language, supported_languages text[], currency) | @db-architect | 2 | — | default 'en'/['en'] backfill |
| S1.6 | Migration 0015 partial + GIN indexes — (store_id, status), (store_id, category_id, sort_order), GIN(dayparts), GIN(allergens) | @db-architect | 4 | S1.2 | TV-visible query < 20ms (seed 1000) |
| S1.7 | `packages/shared/src/enums.ts` 정본 갱신 — DAYPART 6-value, ALLERGEN 9, SPICE_LEVEL 5, ITEM_STATUS 3, SUPPORTED_LANG 5, IMPORT_SOURCE 9, IMPORT_STATUS 7 | @backend-dev | 2 | — | tsc clean + hook 통과 |
| S1.8 | Zod schemas — MenuItemCreate/Update, CategoryCreate, DaypartUpdate, ToggleSoldOut | @backend-dev | 6 | S1.7 | refine 검증 (겹침/external_id/dayparts enum) |
| S1.9 | GET `/api/menu/items` — query `?daypart=&category=&status=&lang=&limit=` (AG-021: server-side filter + max limit) | @backend-dev | 6 | S1.2, S1.8 | curl: 4가지 필터 조합 200 |
| S1.10 | POST `/api/menu/items` | @backend-dev | 6 | S1.9 | priceCents 정수 강제, sync_source 'restosync' 자동 |
| S1.11 | PATCH `/api/menu/items/:id` | @backend-dev | 4 | S1.10 | sync_source ≠ 'restosync' → 403 (BR-20) |
| S1.12 | DELETE `/api/menu/items/:id` (soft, deleted_at) | @backend-dev | 3 | S1.10 | GET 결과에서 제외, audit log 1행 |
| S1.13 | PATCH `/api/menu/items/:id/toggle-sold-out` (fast-path, kitchen 허용 — AM01-008) | @backend-dev | 4 | S1.10 | 3초 내 WS `display:menu_item_sold_out_toggled` 발사 |
| S1.14 | CRUD `/api/menu/categories` + 드래그 순서 PATCH bulk | @backend-dev | 6 | S1.1, S1.8 | 삭제 시 옵션 이동 강제 (BR-14) |
| S1.15 | GET/PUT `/api/menu/dayparts` — 시간 겹침 검증 (422 + inline) | @backend-dev | 6 | S1.3, S1.8 | 6 windows 합 == 24h 검증 |
| S1.16 | Audit middleware — mutation 자동 로그 (operation, before/after, actor_id) | @backend-dev | 5 | S1.4 | 모든 PATCH/DELETE 1행 보장 |
| S1.17 | Unit tests (Vitest) — coverage ≥ 80% | @test-writer | 12 | S1.9~S1.15 | `pnpm test` clean, c8 report |
| S1.18 | Integration tests (testcontainers + 실 PG) | @test-writer | 8 | S1.17 | docker-compose up + suite green |
| S1.19 | Code review + OpenAPI swagger gen | @reviewer | 6 | all | AG-001/004/009/013/018/021 위반 0 |

## Sprint 1 Exit Criteria
- [ ] 6 migrations applied to staging without manual fix
- [ ] All endpoints curl test green (Postman/Bruno collection commit)
- [ ] Unit + integration coverage ≥ 80%
- [ ] EXPLAIN ANALYZE: TV-visible query < 20ms (1000 items seed)
- [ ] PR review by @reviewer — AG/ANTI 위반 0건
- [ ] `hooks/pre-edit-schema-check.sh` 4-value daypart 차단 시연

## Demo 시연 (Sprint Review)
```
1. POST item (10 lang fields) → 201
2. GET ?daypart=lunch&category=chicken&lang=ko → 항목 노출
3. PATCH price_cents (sync_source='restosync') → 200
4. PATCH price_cents (sync_source='toast') → 403 (BR-20)
5. PATCH toggle-sold-out (kitchen role) → 200 + audit log
6. DELETE → soft, GET 미노출, audit log row 확인
7. PUT dayparts 겹침 → 422 inline
```

## Risks
- 0010~0015 6연속 migration 충돌 시 staging rollback 절차 명문화 (devops)
- Sprint 1 마지막 날 OpenAPI gen 누락 → 다음 Sprint 진입 차단 가능 → S1.19 마감일 D+1 여유 확보
