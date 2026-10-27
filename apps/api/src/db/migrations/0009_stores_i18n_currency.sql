-- Sprint 1 S1.5 — stores i18n + currency + daypart_windows + business_hours 확장
-- 2026-05-17 · M01 PRD v1.2 §7.3
-- BR-11: i18n fallback (default_language로 누락 lang 대체)
-- BR-02: stores.timezone 기준 모든 시간 계산
-- AG-024: business_hours로 영업 종료 표시 (daypart 'closed' 변형값 차단)

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS default_language    varchar(5)  NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS supported_languages text[]      NOT NULL DEFAULT ARRAY['en']::text[],
  ADD COLUMN IF NOT EXISTS currency            varchar(3)  NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS daypart_windows     jsonb,
  ADD COLUMN IF NOT EXISTS business_hours      jsonb;

-- 기본 daypart_windows 시드 (기존 stores에만, 매장이 직접 편집)
-- Page D /menu/daypart 편집 가능. 처음에는 PRD §1.1 추천값.
UPDATE stores
SET daypart_windows = jsonb_build_object(
  'breakfast', jsonb_build_object('start', '06:00', 'end', '11:00'),
  'lunch',     jsonb_build_object('start', '11:00', 'end', '14:30'),
  'snack',     jsonb_build_object('start', '14:30', 'end', '17:00'),
  'dinner',    jsonb_build_object('start', '17:00', 'end', '21:00'),
  'late',      jsonb_build_object('start', '21:00', 'end', '02:00')
)
WHERE daypart_windows IS NULL;
