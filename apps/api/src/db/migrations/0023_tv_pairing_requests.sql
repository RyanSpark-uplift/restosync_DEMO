-- M02 pairing UX: TV displays a 6-char code on first boot. Staff enters the
-- code on tablet → server creates tv_instances row under staff's store_id
-- and links it here. AG-008 pattern, extended from tv_screens to tv_instances.
--
-- TV polls /api/tv-instances/pair-status?code=X every 2s; on claim it receives
-- the new tv_instance_id and saves to AsyncStorage. No manual UUID entry.

CREATE TABLE IF NOT EXISTS "tv_pairing_requests" (
  "pairing_code"   varchar(6)  PRIMARY KEY,
  "device_id"      varchar(128) NOT NULL,
  "expires_at"     timestamp    NOT NULL,
  "created_at"     timestamp    NOT NULL DEFAULT now(),
  "claimed_at"     timestamp,
  "tv_instance_id" uuid REFERENCES "tv_instances"("id") ON DELETE SET NULL
);

-- Cron-friendly partial index for cleaning expired unclaimed entries.
CREATE INDEX IF NOT EXISTS "tv_pairing_requests_pending_expires_idx"
  ON "tv_pairing_requests" ("expires_at")
  WHERE "claimed_at" IS NULL;
