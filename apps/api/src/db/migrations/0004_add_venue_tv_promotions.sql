-- venue/tv multi-profile architecture + promotions + menu_items extensions

-- ── New enums ─────────────────────────────────────────────────────────────────
CREATE TYPE tv_profile_type  AS ENUM ('menu', 'pickup', 'event');
CREATE TYPE pickup_mode      AS ENUM ('single', 'multi_venue');
CREATE TYPE tv_function_type AS ENUM ('menu', 'pickup', 'event', 'ad');

-- ── venue_groups ──────────────────────────────────────────────────────────────
CREATE TABLE venue_groups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(80) NOT NULL,
  code            VARCHAR(20) UNIQUE NOT NULL,
  footer_message  TEXT
);

-- ── venue_group_members ───────────────────────────────────────────────────────
CREATE TABLE venue_group_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID NOT NULL REFERENCES stores(id),
  venue_group_id  UUID NOT NULL REFERENCES venue_groups(id),
  label           VARCHAR(40),
  color_hex       VARCHAR(7),
  display_order   INTEGER DEFAULT 0
);

-- ── tv_content_profiles (before tv_instances — FK target) ─────────────────────
CREATE TABLE tv_content_profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id            UUID NOT NULL REFERENCES stores(id),
  profile_name        VARCHAR(80) NOT NULL,
  profile_type        tv_profile_type NOT NULL,
  menu_category_ids   UUID[],
  daypart_rules       JSONB,
  pickup_mode         pickup_mode,
  tts_enabled         BOOLEAN DEFAULT false,
  event_group_id      UUID,
  slide_interval_sec  INTEGER DEFAULT 10
);

-- ── tv_instances ──────────────────────────────────────────────────────────────
CREATE TABLE tv_instances (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      UUID NOT NULL REFERENCES stores(id),
  display_name  VARCHAR(80),
  function_type tv_function_type NOT NULL,
  profile_id    UUID REFERENCES tv_content_profiles(id),
  ip_address    VARCHAR(45),
  is_active     BOOLEAN DEFAULT true,
  last_ping_at  TIMESTAMP,
  sort_order    INTEGER DEFAULT 0
);

-- ── promotions ────────────────────────────────────────────────────────────────
CREATE TABLE promotions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id          UUID NOT NULL REFERENCES stores(id),
  title             VARCHAR(100) NOT NULL,
  discount_rate     NUMERIC(5, 2),
  banner_text       TEXT,
  countdown_end_at  TIMESTAMP,
  is_active         BOOLEAN DEFAULT false
);

-- ── menu_items: extend existing table ────────────────────────────────────────
ALTER TABLE menu_items
  ADD COLUMN photo_url_nobg  TEXT,
  ADD COLUMN is_featured     BOOLEAN DEFAULT false,
  ADD COLUMN is_hot          BOOLEAN DEFAULT false,
  ADD COLUMN sold_out        BOOLEAN DEFAULT false;
