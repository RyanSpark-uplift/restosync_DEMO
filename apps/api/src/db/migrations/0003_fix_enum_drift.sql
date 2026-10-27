-- AG-013: enum drift fix — align DB with shared/enums.ts canonical values
-- order_status: pending→new, preparing→prep (only if the legacy labels exist)
-- order_source: add pos, kiosk
-- Guarded: a fresh DB already gets new/prep from 0000, so the renames must be
-- no-ops there. PostgreSQL 10+ ALTER TYPE RENAME VALUE is safe in-place.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
             WHERE t.typname = 'order_status' AND e.enumlabel = 'pending') THEN
    ALTER TYPE order_status RENAME VALUE 'pending' TO 'new';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
             WHERE t.typname = 'order_status' AND e.enumlabel = 'preparing') THEN
    ALTER TYPE order_status RENAME VALUE 'preparing' TO 'prep';
  END IF;
END $$;

ALTER TYPE order_source ADD VALUE IF NOT EXISTS 'pos' BEFORE 'manual';
ALTER TYPE order_source ADD VALUE IF NOT EXISTS 'kiosk' BEFORE 'manual';
