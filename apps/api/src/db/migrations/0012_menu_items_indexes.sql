-- Sprint 1 S1.6 — menu_items partial + GIN 인덱스 (M01 PRD v1.2 §12 / §21.2)
-- 2026-05-17 · TV-visible query < 20ms (seed 1000 items) 목표
-- AG-001/021: store_id 필터 + server-side status 필터 최적화

-- TV 노출 쿼리: WHERE store_id = X AND show_on_tv = true AND deleted_at IS NULL AND (sold_out = false OR ...)
CREATE INDEX IF NOT EXISTS menu_items_store_tv_visible_idx
  ON menu_items (store_id, category_id, sort_order)
  WHERE show_on_tv = true AND deleted_at IS NULL;

-- 카테고리별 sort (Tablet Page A/C 드래그 정렬)
CREATE INDEX IF NOT EXISTS menu_items_store_cat_sort_idx
  ON menu_items (store_id, category_id, sort_order)
  WHERE deleted_at IS NULL;

-- Daypart 필터 (BR-09, GET /api/menu/items?daypart=lunch)
CREATE INDEX IF NOT EXISTS menu_items_dayparts_gin_idx
  ON menu_items USING GIN (dayparts_arr);

-- Allergens 필터 (Phase 1.5 알레르기 표시)
CREATE INDEX IF NOT EXISTS menu_items_allergens_gin_idx
  ON menu_items USING GIN (allergens);

-- Featured pool 후보 (BR-21 — Featured rotation)
CREATE INDEX IF NOT EXISTS menu_items_store_featured_idx
  ON menu_items (store_id)
  WHERE is_featured = true AND deleted_at IS NULL AND show_on_tv = true;

-- LTO 만료 후보 (BR-10 — cron 매시 체크 + TV 매분)
CREATE INDEX IF NOT EXISTS menu_items_store_lto_idx
  ON menu_items (store_id, available_until)
  WHERE available_until IS NOT NULL AND deleted_at IS NULL;

-- sync_source ≠ 'restosync' 항목 식별 (BR-20 PATCH 403 분기)
CREATE INDEX IF NOT EXISTS menu_items_store_sync_idx
  ON menu_items (store_id, sync_source)
  WHERE sync_source != 'restosync' AND deleted_at IS NULL;
