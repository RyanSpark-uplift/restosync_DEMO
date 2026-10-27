-- M01 Sprint G.A — Combos (PRD §4.2 Page G / §7.2 / BR-23)
-- AG-001 store_id 필수 / BR-05 soft delete / 5-lang i18n name.
-- BR-23 enforcement은 API 라우트 (price_cents ≤ Σ(item.price × qty)) — DB CHECK 불가.

CREATE TABLE IF NOT EXISTS "menu_combos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"name" jsonb NOT NULL,
	"description" jsonb,
	"photo_url" text,
	"price_cents" integer NOT NULL,
	"items_total_cents" integer DEFAULT 0 NOT NULL,
	"savings_cents" integer DEFAULT 0 NOT NULL,
	"dayparts_arr" text[] DEFAULT ARRAY['all']::text[] NOT NULL,
	"is_sold_out" boolean DEFAULT false NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"show_on_tv" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "menu_combos" ADD CONSTRAINT "menu_combos_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- price_cents > 0
DO $$ BEGIN
 ALTER TABLE "menu_combos"
   ADD CONSTRAINT "menu_combos_price_cents_check"
   CHECK (price_cents > 0);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- BR-23 invariant: savings = items_total - price (non-negative)
DO $$ BEGIN
 ALTER TABLE "menu_combos"
   ADD CONSTRAINT "menu_combos_savings_check"
   CHECK (savings_cents >= 0 AND savings_cents = items_total_cents - price_cents);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "menu_combos_store_sort_idx"
  ON "menu_combos" USING btree ("store_id","sort_order");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "menu_combos_store_featured_idx"
  ON "menu_combos" USING btree ("store_id","is_featured");
