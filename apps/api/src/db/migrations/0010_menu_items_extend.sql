-- Sprint 1 S1.2 — menu_items additive 확장 (M01 PRD v1.2 §7.2)
-- 2026-05-17 · BR-01 price_cents 강제 / BR-05 soft delete / BR-11 i18n / BR-20 sync_source
-- 전략: 새 컬럼 추가 + 기존 데이터 변환. 기존 컬럼은 코드 마이그레이션 완료 후 별도 drop.

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS price_cents          integer,
  ADD COLUMN IF NOT EXISTS name_i18n            jsonb,
  ADD COLUMN IF NOT EXISTS description_i18n     jsonb,
  ADD COLUMN IF NOT EXISTS dayparts_arr         text[],
  ADD COLUMN IF NOT EXISTS category_id          uuid REFERENCES menu_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS has_variants         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_modifiers        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tax_policy           text NOT NULL DEFAULT 'exclusive',
  ADD COLUMN IF NOT EXISTS tax_category_id      uuid,
  ADD COLUMN IF NOT EXISTS sync_source          text NOT NULL DEFAULT 'restosync',
  ADD COLUMN IF NOT EXISTS external_id          varchar(80),
  ADD COLUMN IF NOT EXISTS external_updated_at  timestamp,
  ADD COLUMN IF NOT EXISTS last_synced_at       timestamp,
  ADD COLUMN IF NOT EXISTS sync_conflict_at     timestamp,
  ADD COLUMN IF NOT EXISTS import_job_id        uuid,
  ADD COLUMN IF NOT EXISTS import_source        text,
  ADD COLUMN IF NOT EXISTS calories             integer,
  ADD COLUMN IF NOT EXISTS spice_level          text,
  ADD COLUMN IF NOT EXISTS allergens            text[] DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS available_from       timestamp,
  ADD COLUMN IF NOT EXISTS available_until      timestamp,
  ADD COLUMN IF NOT EXISTS kitchen_name         varchar(40),
  ADD COLUMN IF NOT EXISTS show_on_tv           boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at           timestamp NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS deleted_at           timestamp;

-- ── 데이터 변환 (legacy → 정본) ─────────────────────────────────────────
-- BR-01: price decimal → price_cents integer (×100, ROUND for safety)
UPDATE menu_items
SET price_cents = ROUND(price * 100)::integer
WHERE price_cents IS NULL AND price IS NOT NULL;

-- BR-11: name/description varchar → i18n jsonb {en: <legacy value>}
UPDATE menu_items
SET name_i18n = jsonb_build_object('en', name)
WHERE name_i18n IS NULL AND name IS NOT NULL;

UPDATE menu_items
SET description_i18n = jsonb_build_object('en', description)
WHERE description_i18n IS NULL AND description IS NOT NULL;

-- dayparts jsonb → text[] (기존이 array 형태면 그대로 변환)
UPDATE menu_items
SET dayparts_arr = ARRAY(SELECT jsonb_array_elements_text(dayparts))
WHERE dayparts_arr IS NULL
  AND dayparts IS NOT NULL
  AND jsonb_typeof(dayparts) = 'array';

-- (store_id, external_id) 부분 unique (AG-018, BR-26 — store-scoped)
CREATE UNIQUE INDEX IF NOT EXISTS menu_items_store_extid_uniq
  ON menu_items (store_id, external_id)
  WHERE external_id IS NOT NULL AND deleted_at IS NULL;
