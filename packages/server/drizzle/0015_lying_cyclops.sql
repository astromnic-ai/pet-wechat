CREATE TYPE "public"."pet_activity_mode" AS ENUM('free', 'custom', 'real');--> statement-breakpoint
CREATE TABLE "pet_mode_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"pet_id" text NOT NULL,
	"repeat" text NOT NULL,
	"days" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"date" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pet_mode_plans_repeat_check" CHECK ("pet_mode_plans"."repeat" IN ('once', 'weekly'))
);
--> statement-breakpoint
CREATE TABLE "pet_mode_slots" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"start" text NOT NULL,
	"end" text NOT NULL,
	"action" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pets" ADD COLUMN "activity_mode" "pet_activity_mode" DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "pet_mode_plans" ADD CONSTRAINT "pet_mode_plans_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_mode_slots" ADD CONSTRAINT "pet_mode_slots_plan_id_pet_mode_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."pet_mode_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_pet_mode_plans_pet_sort" ON "pet_mode_plans" USING btree ("pet_id","sort_order","id");--> statement-breakpoint
CREATE INDEX "idx_pet_mode_slots_plan_sort" ON "pet_mode_slots" USING btree ("plan_id","sort_order","id");