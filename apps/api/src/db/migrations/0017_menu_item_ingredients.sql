-- M01 Sprint 4 S4.6 — P1.5 Recipe (item ↔ ingredient N:M)
-- PRD §3.2 #6. AG-018 복합 unique (store_id, item_id, ingredient_id). PUT 전체 교체 1tx 패턴.
-- ON DELETE: item cascade / ingredient RESTRICT (재고 추적 중인 재료 삭제 차단).

CREATE TABLE IF NOT EXISTS "menu_item_ingredients" (
	"store_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"quantity" numeric(10, 3) NOT NULL,
	"unit" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "menu_item_ingredients" ADD CONSTRAINT "menu_item_ingredients_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "menu_item_ingredients" ADD CONSTRAINT "menu_item_ingredients_item_id_menu_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "menu_item_ingredients" ADD CONSTRAINT "menu_item_ingredients_ingredient_id_menu_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."menu_ingredients"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- AG-013 unit enum CHECK
DO $$ BEGIN
 ALTER TABLE "menu_item_ingredients"
   ADD CONSTRAINT "menu_item_ingredients_unit_check"
   CHECK (unit IN ('g','kg','ml','L','oz','lb','each','piece','dozen'));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- quantity > 0 enforce
DO $$ BEGIN
 ALTER TABLE "menu_item_ingredients"
   ADD CONSTRAINT "menu_item_ingredients_qty_positive_check"
   CHECK (quantity > 0);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "menu_item_ingredients_uniq" ON "menu_item_ingredients" USING btree ("store_id","item_id","ingredient_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "menu_item_ingredients_item_sort_idx" ON "menu_item_ingredients" USING btree ("store_id","item_id","sort_order");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "menu_item_ingredients_ingredient_idx" ON "menu_item_ingredients" USING btree ("store_id","ingredient_id");
