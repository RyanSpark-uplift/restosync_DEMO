-- Sprint 1 S1.3 — Additive 6-value Daypart (M01 PRD v1.2 D0)
-- 2026-05-17 · drift 1프레임 금지: enums.ts + schema.ts + 본 SQL 단일 commit
--
-- Additive 변경: 기존 4값 보존, snack/late 신규 추가
-- - breakfast (기존)
-- - lunch (기존)
-- - snack (신규, lunch와 dinner 사이)
-- - dinner (기존)
-- - late (신규, dinner와 all 사이)
-- - all (기존, wildcard)
--
-- 호환성: 기존 row의 dayparts 값은 모두 보존됨 (additive only).
-- 'closed'는 daypart enum이 아님 (stores.business_hours로 분리).

ALTER TYPE daypart ADD VALUE IF NOT EXISTS 'snack' BEFORE 'dinner';
ALTER TYPE daypart ADD VALUE IF NOT EXISTS 'late' BEFORE 'all';
