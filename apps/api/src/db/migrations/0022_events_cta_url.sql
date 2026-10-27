-- M03 Sprint B — events.cta_url (TV QR target).
-- Nullable text. Optional CTA URL (reservation page, social account, etc).
-- TV③ EventBoardScreen renders QR code bottom-right when populated.
ALTER TABLE "events" ADD COLUMN "cta_url" text;
