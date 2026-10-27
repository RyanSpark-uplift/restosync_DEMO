-- Enum migration applied manually via psql (DROP TYPE requires no-transaction context).
-- order_status: new/prep removed → pending/preparing added
-- order_source: pos/kiosk removed
-- Applied: 2026-05-09
SELECT 1;
