CREATE TYPE "public"."custom_action_status" AS ENUM('pending', 'processing', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."interaction_type" AS ENUM('touch', 'shake', 'gesture');--> statement-breakpoint
CREATE TYPE "public"."pet_activity_mode" AS ENUM('free', 'custom', 'real');--> statement-breakpoint
CREATE TYPE "public"."schedule_source" AS ENUM('system', 'custom');--> statement-breakpoint
ALTER TYPE "public"."message_type" ADD VALUE 'activity';--> statement-breakpoint
ALTER TYPE "public"."message_type" ADD VALUE 'health';--> statement-breakpoint
ALTER TYPE "public"."message_type" ADD VALUE 'device';--> statement-breakpoint
ALTER TYPE "public"."message_type" ADD VALUE 'community';--> statement-breakpoint
ALTER TYPE "public"."species" ADD VALUE 'other';--> statement-breakpoint
CREATE TABLE "custom_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"pet_id" text NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"video_url" text NOT NULL,
	"status" "custom_action_status" NOT NULL,
	"result_image_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_interactions" (
	"id" text PRIMARY KEY NOT NULL,
	"desktop_device_id" text NOT NULL,
	"pet_id" text NOT NULL,
	"interaction_type" "interaction_type" NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pet_mode_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"pet_id" text NOT NULL,
	"source" "schedule_source" NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"action_type" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pet_modes" (
	"id" text PRIMARY KEY NOT NULL,
	"pet_id" text NOT NULL,
	"mode" "pet_activity_mode" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pet_modes_pet_id_unique" UNIQUE("pet_id")
);
--> statement-breakpoint
ALTER TABLE "pets" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "pets" ADD COLUMN "color" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "device_binding_quota" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "custom_actions" ADD CONSTRAINT "custom_actions_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_actions" ADD CONSTRAINT "custom_actions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_interactions" ADD CONSTRAINT "device_interactions_desktop_device_id_desktop_devices_id_fk" FOREIGN KEY ("desktop_device_id") REFERENCES "public"."desktop_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_interactions" ADD CONSTRAINT "device_interactions_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_mode_schedules" ADD CONSTRAINT "pet_mode_schedules_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_modes" ADD CONSTRAINT "pet_modes_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;