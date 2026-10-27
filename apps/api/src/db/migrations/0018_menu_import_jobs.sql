-- M01 Sprint 5A — Excel/CSV import job tracking (PRD §3.5 / §5.3)
-- AG-001 store_id required. BR-33: store당 동시 1 active job (partial unique).
-- IMPORT_SOURCE / IMPORT_STATUS enum 정본은 packages/shared/src/enums.ts (text + CHECK).

CREATE TABLE IF NOT EXISTS "menu_import_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"filename" varchar(200),
	"raw_path" text,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"valid_rows" integer DEFAULT 0 NOT NULL,
	"invalid_rows" integer DEFAULT 0 NOT NULL,
	"errors" jsonb,
	"preview" jsonb,
	"mode" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"finished_at" timestamp,
	"deleted_at" timestamp
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "menu_import_jobs" ADD CONSTRAINT "menu_import_jobs_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "menu_import_jobs" ADD CONSTRAINT "menu_import_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- AG-013 source enum CHECK (IMPORT_SOURCE 9-value 정본)
DO $$ BEGIN
 ALTER TABLE "menu_import_jobs"
   ADD CONSTRAINT "menu_import_jobs_source_check"
   CHECK (source IN ('excel','csv','ai_ocr','web_scrape','pos_square','pos_toast','pos_clover','pos_lightspeed','manual'));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- AG-013 status enum CHECK (IMPORT_STATUS 7-value 정본)
DO $$ BEGIN
 ALTER TABLE "menu_import_jobs"
   ADD CONSTRAINT "menu_import_jobs_status_check"
   CHECK (status IN ('pending','validating','preview_ready','executing','completed','failed','cancelled'));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- mode CHECK (BR-30/31: lenient or strict, NULL until execute)
DO $$ BEGIN
 ALTER TABLE "menu_import_jobs"
   ADD CONSTRAINT "menu_import_jobs_mode_check"
   CHECK (mode IS NULL OR mode IN ('lenient','strict'));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "menu_import_jobs_store_created_idx" ON "menu_import_jobs" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "menu_import_jobs_store_status_idx" ON "menu_import_jobs" USING btree ("store_id","status");--> statement-breakpoint
-- BR-33: store당 active(non-terminal) job 1개만 — partial unique
CREATE UNIQUE INDEX IF NOT EXISTS "menu_import_jobs_active_uniq"
  ON "menu_import_jobs" USING btree ("store_id")
  WHERE "status" IN ('pending','validating','preview_ready','executing');
