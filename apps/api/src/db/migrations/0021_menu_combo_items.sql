-- M01 Sprint G.A — Combo items N:M (PRD §7.2 / BR-18)
-- AG-018 복합 unique. item_id FK는 RESTRICT — 콤보에 포함된 menu_item 삭제 시 차단(라우트 409).
-- is_substitutable + group_name: BR-18 "Choose 1 of these in Main/Side/Drink".

CREATE TABLE IF NOT EXISTS "menu_combo_items" (
	"store_id" uuid NOT NULL,
	"combo_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"is_substitutable" boolean DEFAULT false NOT NULL,
	"group_name" varchar(40),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "menu_combo_items" ADD CONSTRAINT "menu_combo_items_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "menu_combo_items" ADD CONSTRAINT "menu_combo_items_combo_id_menu_combos_id_fk" FOREIGN KEY ("combo_id") REFERENCES "public"."menu_combos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "menu_combo_items" ADD CONSTRAINT "menu_combo_items_item_id_menu_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."menu_items"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "menu_combo_items"
   ADD CONSTRAINT "menu_combo_items_quantity_check"
   CHECK (quantity > 0 AND quantity <= 99);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "menu_combo_items_uniq"
  ON "menu_combo_items" USING btree ("store_id","combo_id","item_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "menu_combo_items_combo_sort_idx"
  ON "menu_combo_items" USING btree ("store_id","combo_id","sort_order");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "menu_combo_items_item_idx"
  ON "menu_combo_items" USING btree ("store_id","item_id");
