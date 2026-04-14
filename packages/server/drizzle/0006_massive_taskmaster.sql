CREATE TYPE "public"."device_claim_status" AS ENUM('occupied', 'available', 'reset_required');--> statement-breakpoint
CREATE TYPE "public"."device_type" AS ENUM('collar', 'desktop');--> statement-breakpoint
CREATE TYPE "public"."device_upgrade_status" AS ENUM('idle', 'pending', 'success', 'failed');--> statement-breakpoint
CREATE TYPE "public"."user_setting_language" AS ENUM('zh-CN', 'zh-TW', 'en-US');--> statement-breakpoint
CREATE TYPE "public"."user_setting_theme" AS ENUM('system', 'light', 'dark', 'blue');--> statement-breakpoint
CREATE TABLE "firmware_releases" (
	"id" text PRIMARY KEY NOT NULL,
	"device_type" "device_type" NOT NULL,
	"version" varchar(64) NOT NULL,
	"release_notes" text NOT NULL,
	"released_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interaction_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"pet_id" text NOT NULL,
	"device_id" text,
	"action_type" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"message_enabled" boolean DEFAULT true NOT NULL,
	"sound_enabled" boolean DEFAULT true NOT NULL,
	"theme" "user_setting_theme" DEFAULT 'system' NOT NULL,
	"language" "user_setting_language" DEFAULT 'zh-CN' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "collar_devices" ADD COLUMN "claim_status" "device_claim_status" DEFAULT 'occupied' NOT NULL;--> statement-breakpoint
ALTER TABLE "collar_devices" ADD COLUMN "usage_duration_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "collar_devices" ADD COLUMN "upgrade_status" "device_upgrade_status" DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE "desktop_devices" ADD COLUMN "claim_status" "device_claim_status" DEFAULT 'occupied' NOT NULL;--> statement-breakpoint
ALTER TABLE "desktop_devices" ADD COLUMN "usage_duration_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "desktop_devices" ADD COLUMN "upgrade_status" "device_upgrade_status" DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email" varchar(255);--> statement-breakpoint
ALTER TABLE "interaction_events" ADD CONSTRAINT "interaction_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interaction_events" ADD CONSTRAINT "interaction_events_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_firmware_releases_device_type_version" ON "firmware_releases" USING btree ("device_type","version");--> statement-breakpoint
CREATE INDEX "idx_firmware_releases_device_type_released_at" ON "firmware_releases" USING btree ("device_type","released_at");--> statement-breakpoint
CREATE INDEX "idx_interaction_events_pet_occurred_at" ON "interaction_events" USING btree ("pet_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_interaction_events_user_occurred_at" ON "interaction_events" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_interaction_events_device_occurred_at" ON "interaction_events" USING btree ("device_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");