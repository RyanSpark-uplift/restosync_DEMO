DO $$ BEGIN
 CREATE TYPE "public"."daypart" AS ENUM('breakfast', 'lunch', 'dinner', 'all');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."event_type" AS ENUM('happy_hour', 'live_event', 'lto', 'alert', 'promo');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."order_source" AS ENUM('pos', 'kiosk', 'manual', 'doordash', 'ubereats', 'grubhub', 'fantuan', 'hungrypanda');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."order_status" AS ENUM('new', 'prep', 'ready', 'collected', 'cancelled');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."screen_role" AS ENUM('menu', 'pickup', 'event', 'ai_ads');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"title" varchar(100),
	"type" "event_type" NOT NULL,
	"image_url" text,
	"ticker_text" text,
	"start_at" timestamp,
	"end_at" timestamp,
	"recurrence" jsonb,
	"active" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "menu_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"category" varchar(40),
	"name" varchar(80) NOT NULL,
	"description" text,
	"price" numeric(10, 2),
	"image_url" text,
	"available" boolean DEFAULT true,
	"dayparts" jsonb,
	"tags" jsonb,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"display_number" varchar(10) NOT NULL,
	"customer_name" varchar(60),
	"status" "order_status" DEFAULT 'new',
	"source" "order_source" DEFAULT 'manual',
	"items" jsonb,
	"external_id" varchar(80),
	"created_at" timestamp DEFAULT now(),
	"ready_at" timestamp,
	"collected_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "refresh_tokens" (
	"jti" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"issued_at" timestamp DEFAULT now(),
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"revoke_reason" varchar(30)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(80) NOT NULL,
	"slug" varchar(40) NOT NULL,
	"license_key" varchar(30),
	"timezone" varchar(50) DEFAULT 'America/Los_Angeles',
	"pos_type" varchar(20),
	"subscription_tier" varchar(20) DEFAULT 'basic',
	"brand_color" varchar(7) DEFAULT '#E8450A',
	"logo_url" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "stores_slug_unique" UNIQUE("slug"),
	CONSTRAINT "stores_license_key_unique" UNIQUE("license_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tv_screens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"role" "screen_role" NOT NULL,
	"name" varchar(40),
	"pairing_code" varchar(6),
	"pairing_expires_at" timestamp,
	"last_seen_at" timestamp,
	"app_version" varchar(20),
	"online" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"name" varchar(40) NOT NULL,
	"pin_hash" varchar(60) NOT NULL,
	"role" varchar(20) DEFAULT 'staff',
	"total_failed_logins" integer DEFAULT 0,
	"last_login_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "events" ADD CONSTRAINT "events_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "orders" ADD CONSTRAINT "orders_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tv_screens" ADD CONSTRAINT "tv_screens_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_store_status_idx" ON "orders" USING btree ("store_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rt_user_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rt_active_idx" ON "refresh_tokens" USING btree ("expires_at");