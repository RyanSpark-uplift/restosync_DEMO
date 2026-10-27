-- Sprint 1 S1.4 — menu_audit_log table (M01 PRD v1.2, BR-06)
-- 2026-05-17 · mutation 자동 감사 로그. append-only.
-- AG-001: store_id FK + (store_id, ts) idx → 매장별 조회 최적
-- middleware/audit.ts (S1.16)에서 모든 PATCH/DELETE 1행 작성

CREATE TABLE IF NOT EXISTS menu_audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  entity_type varchar(30) NOT NULL,
  entity_id   uuid NOT NULL,
  operation   varchar(20) NOT NULL,
  before      jsonb,
  after       jsonb,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  actor       varchar(16) NOT NULL DEFAULT 'staff',
  reason      varchar(100),
  ts          timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS menu_audit_store_ts_idx
  ON menu_audit_log (store_id, ts);

CREATE INDEX IF NOT EXISTS menu_audit_store_entity_idx
  ON menu_audit_log (store_id, entity_type, entity_id);
