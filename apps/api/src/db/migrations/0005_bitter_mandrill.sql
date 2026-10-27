DO $$ BEGIN
 CREATE TYPE "public"."order_priority" AS ENUM('normal', 'rush', 'scheduled', 'catering');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TYPE "order_status" ADD VALUE 'ready_to_expedite';--> statement-breakpoint
ALTER TYPE "order_status" ADD VALUE 'remaking';--> statement-breakpoint
ALTER TYPE "order_status" ADD VALUE 'expired';--> statement-breakpoint
ALTER TYPE "order_status" ADD VALUE 'scheduled';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "order_state_transitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"from_status" "order_status",
	"to_status" "order_status" NOT NULL,
	"actor" varchar(16) NOT NULL,
	"actor_id" uuid,
	"reason" varchar(60),
	"ts" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "store_settings" (
	"store_id" uuid PRIMARY KEY NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_phone" varchar(20);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "priority" "order_priority" DEFAULT 'normal';--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "items_summary" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "pickup_location" varchar(40);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "pickup_time" timestamp;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "estimated_prep_minutes" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "accepted_at" timestamp;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "preparing_at" timestamp;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "expedite_at" timestamp;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "picked_up_at" timestamp;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "expired_at" timestamp;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "order_state_transitions" ADD CONSTRAINT "order_state_transitions_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "order_state_transitions" ADD CONSTRAINT "order_state_transitions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "store_settings" ADD CONSTRAINT "store_settings_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ost_store_ts_idx" ON "order_state_transitions" USING btree ("store_id","ts");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ost_store_order_ts_idx" ON "order_state_transitions" USING btree ("store_id","order_id","ts");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_store_priority_idx" ON "orders" USING btree ("store_id","priority");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_store_pickup_time_idx" ON "orders" USING btree ("store_id","pickup_time");