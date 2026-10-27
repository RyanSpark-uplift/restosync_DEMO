-- AG-018: orders display_number partial unique — include new terminal 'expired'.
-- Replaces the predicate from 0001_partial-indexes.sql.
--
-- IMPORTANT: this migration MUST run in a separate transaction from 0005_bitter_mandrill.sql
-- because Postgres forbids using a newly-added enum literal in the same tx that added it
-- (error 55P04 — "unsafe use of new value"). drizzle-kit migrate bundles pending migrations
-- in one tx, so apply this one via psql or apps/api/src/db/apply-migrations.ts after 0005
-- has committed.

DROP INDEX IF EXISTS orders_active_dn_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS orders_active_dn_uniq
  ON orders (store_id, display_number)
  WHERE status NOT IN ('collected', 'cancelled', 'expired');
