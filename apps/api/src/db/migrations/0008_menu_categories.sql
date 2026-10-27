-- Sprint 1 S1.1 — menu_categories table (M01 PRD v1.2 §4.3 Page C, §7)
-- 2026-05-17 · BR-26: (store_id, external_id) store-scoped unique
-- AG-001/018: store_id FK cascade + 복합 partial unique idx
-- BR-05: soft delete via deleted_at

CREATE TABLE IF NOT EXISTS menu_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name        jsonb NOT NULL,
  icon        varchar(8),
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  external_id varchar(80),
  created_at  timestamp NOT NULL DEFAULT NOW(),
  updated_at  timestamp NOT NULL DEFAULT NOW(),
  deleted_at  timestamp
);

CREATE INDEX IF NOT EXISTS menu_cat_store_sort_idx
  ON menu_categories (store_id, sort_order);

-- BR-26 + AG-018: partial unique (store_id, external_id)
-- - external_id NULL row 허용 (Manual CRUD 입력은 external_id 없음)
-- - soft-deleted row 제외 (재import 시 동일 external_id 재사용 가능)
CREATE UNIQUE INDEX IF NOT EXISTS menu_cat_store_extid_uniq
  ON menu_categories (store_id, external_id)
  WHERE external_id IS NOT NULL AND deleted_at IS NULL;
