-- M01 Sprint 4 S4.6 — P1.5 Ingredients catalog (BR-19 prep)
-- PRD §3.9 / §5.4. Store-scoped 재료 카탈로그. AG-001 store_id + BR-05 soft delete.
-- unit은 text + CHECK (INGREDIENT_UNIT 정본 9-value). tax_policy/spice_level 패턴과 동일.

CREATE TABLE IF NOT EXISTS "menu_ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"name" jsonb NOT NULL,
	"unit" text NOT NULL,
	"stock_quantity" numeric(12, 3) DEFAULT '0' NOT NULL,
	"min_threshold" numeric(12, 3),
	"external_id" varchar(80),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "menu_ingredients" ADD CONSTRAINT "menu_ingredients_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- AG-013 unit enum CHECK (INGREDIENT_UNIT 9-value 정본)
DO $$ BEGIN
 ALTER TABLE "menu_ingredients"
   ADD CONSTRAINT "menu_ingredients_unit_check"
   CHECK (unit IN ('g','kg','ml','L','oz','lb','each','piece','dozen'));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- stock_quantity >= 0 enforce
DO $$ BEGIN
 ALTER TABLE "menu_ingredients"
   ADD CONSTRAINT "menu_ingredients_stock_nonneg_check"
   CHECK (stock_quantity >= 0);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "menu_ingredients_store_idx" ON "menu_ingredients" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "menu_ingredients_store_stock_idx" ON "menu_ingredients" USING btree ("store_id","stock_quantity");--> statement-breakpoint
-- AG-018/BR-26: external_id store 단위 partial unique (deleted 제외)
CREATE UNIQUE INDEX IF NOT EXISTS "menu_ingredients_store_external_uniq"
  ON "menu_ingredients" USING btree ("store_id","external_id")
  WHERE "external_id" IS NOT NULL AND "deleted_at" IS NULL;
