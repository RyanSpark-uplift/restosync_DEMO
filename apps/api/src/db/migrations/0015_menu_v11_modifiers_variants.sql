-- M01 Sprint 4 S4.5a — v1.1 Modifiers/Variants 4 신규 테이블
-- PRD §3.2 #5 / §5.2 / §7.1. AG-001 store_id + BR-05 soft delete + BR-16 price_delta_cents.
-- drizzle-kit가 schema 전체 diff로 잘못 만든 부분(이미 0007~0014에 적용된 enum/컬럼) 제거 후 정리됨.

CREATE TABLE IF NOT EXISTS "menu_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"name" jsonb NOT NULL,
	"price_delta_cents" integer DEFAULT 0 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "menu_modifier_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"name" jsonb NOT NULL,
	"min_select" integer DEFAULT 0 NOT NULL,
	"max_select" integer,
	"is_required" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "menu_modifier_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"name" jsonb NOT NULL,
	"price_delta_cents" integer DEFAULT 0 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "menu_item_modifier_groups" (
	"store_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "menu_variants" ADD CONSTRAINT "menu_variants_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "menu_variants" ADD CONSTRAINT "menu_variants_item_id_menu_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "menu_modifier_groups" ADD CONSTRAINT "menu_modifier_groups_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "menu_modifier_options" ADD CONSTRAINT "menu_modifier_options_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "menu_modifier_options" ADD CONSTRAINT "menu_modifier_options_group_id_menu_modifier_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."menu_modifier_groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "menu_item_modifier_groups" ADD CONSTRAINT "menu_item_modifier_groups_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "menu_item_modifier_groups" ADD CONSTRAINT "menu_item_modifier_groups_item_id_menu_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "menu_item_modifier_groups" ADD CONSTRAINT "menu_item_modifier_groups_group_id_menu_modifier_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."menu_modifier_groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "menu_variants_store_item_sort_idx" ON "menu_variants" USING btree ("store_id","item_id","sort_order");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "menu_mod_groups_store_idx" ON "menu_modifier_groups" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "menu_mod_options_store_group_sort_idx" ON "menu_modifier_options" USING btree ("store_id","group_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "menu_item_mod_groups_uniq" ON "menu_item_modifier_groups" USING btree ("store_id","item_id","group_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "menu_item_mod_groups_item_sort_idx" ON "menu_item_modifier_groups" USING btree ("store_id","item_id","sort_order");
