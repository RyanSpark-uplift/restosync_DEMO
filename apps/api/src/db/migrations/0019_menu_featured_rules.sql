-- M01 Sprint F.A — Featured Rotation rules (PRD §3.6 / §4.2 / BR-21)
-- AG-001 store_id required. ONE active rule per (store_id, rule_type).
-- FEATURED_RULE_TYPE 정본 packages/shared/src/enums.ts (text + CHECK).
-- rotation 간격은 stores.featured_rotation_seconds (5/8/10/12s — CHECK).

CREATE TABLE IF NOT EXISTS "menu_featured_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"rule_type" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "menu_featured_rules" ADD CONSTRAINT "menu_featured_rules_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- AG-013 rule_type enum CHECK (FEATURED_RULE_TYPE 정본 4+2값, P1 4값 active)
DO $$ BEGIN
 ALTER TABLE "menu_featured_rules"
   ADD CONSTRAINT "menu_featured_rules_rule_type_check"
   CHECK (rule_type IN ('chef_pick','lto','low_inventory','daypart','analytics_star','analytics_puzzle'));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- AG-018: store당 rule_type 1개만 (간단한 config 모델)
CREATE UNIQUE INDEX IF NOT EXISTS "menu_featured_rules_store_type_uniq"
  ON "menu_featured_rules" USING btree ("store_id","rule_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "menu_featured_rules_store_active_idx"
  ON "menu_featured_rules" USING btree ("store_id","is_active");
--> statement-breakpoint
-- stores.featured_rotation_seconds — 회전 간격 (5/8/10/12s)
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "featured_rotation_seconds" integer DEFAULT 8 NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stores"
   ADD CONSTRAINT "stores_featured_rotation_seconds_check"
   CHECK (featured_rotation_seconds IN (5,8,10,12));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
