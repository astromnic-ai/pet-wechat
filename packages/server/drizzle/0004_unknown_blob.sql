CREATE TYPE "public"."schedule_effective_type" AS ENUM('everyday', 'weekday');--> statement-breakpoint
ALTER TYPE "public"."avatar_status" ADD VALUE 'approved';--> statement-breakpoint
ALTER TYPE "public"."avatar_status" ADD VALUE 'rejected';--> statement-breakpoint
CREATE TABLE "behavior_schedule_blocks" (
	"id" text PRIMARY KEY NOT NULL,
	"schedule_id" text NOT NULL,
	"action_type" text NOT NULL,
	"start_minutes" integer NOT NULL,
	"end_minutes" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "behavior_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"species" text NOT NULL,
	"name" text NOT NULL,
	"effective_type" "schedule_effective_type" DEFAULT 'everyday' NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pet_avatars" ADD COLUMN "reject_reason" text;--> statement-breakpoint
ALTER TABLE "pet_avatars" ADD COLUMN "reviewed_at" timestamp with time zone;