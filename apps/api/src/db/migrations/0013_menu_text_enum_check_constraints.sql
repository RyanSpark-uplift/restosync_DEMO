-- Sprint 1.5 [AM01-012] — text 컬럼에 CHECK 제약 추가 (drift 차단)
-- text 컬럼을 pgEnum으로 마이그레이션하는 대신 CHECK 제약으로 enforcement만 추가.
-- 정본: packages/shared/src/enums.ts (AG-013).
-- 향후 enum 확장 시 이 파일을 갱신하고 동일 commit에서 enums.ts + schema.ts + Zod 동기화.

-- ── menu_items ──────────────────────────────────────────────────────────────

-- TAX_POLICY: exclusive | inclusive | exempt
ALTER TABLE menu_items
  ADD CONSTRAINT menu_items_tax_policy_check
  CHECK (tax_policy IN ('exclusive','inclusive','exempt'));

-- SYNC_SOURCE: restosync | toast | square | clover | chowbus | lightspeed
ALTER TABLE menu_items
  ADD CONSTRAINT menu_items_sync_source_check
  CHECK (sync_source IN ('restosync','toast','square','clover','chowbus','lightspeed'));

-- SPICE_LEVEL: none | mild | medium | hot | extreme  (NULL 허용 — 비매운 항목)
ALTER TABLE menu_items
  ADD CONSTRAINT menu_items_spice_level_check
  CHECK (spice_level IS NULL OR spice_level IN ('none','mild','medium','hot','extreme'));

-- IMPORT_SOURCE: excel | csv | ai_ocr | web_scrape | pos_* | manual  (NULL 허용)
ALTER TABLE menu_items
  ADD CONSTRAINT menu_items_import_source_check
  CHECK (import_source IS NULL OR import_source IN (
    'excel','csv','ai_ocr','web_scrape',
    'pos_square','pos_toast','pos_clover','pos_lightspeed','manual'
  ));
