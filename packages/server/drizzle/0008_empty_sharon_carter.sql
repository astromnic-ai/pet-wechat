CREATE TYPE "public"."membership_level" AS ENUM('free', 'basic', 'pro', 'premium');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('active', 'expired', 'suspended');--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"level" "membership_level" DEFAULT 'free' NOT NULL,
	"status" "membership_status" DEFAULT 'active' NOT NULL,
	"start_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expire_at" timestamp with time zone,
	"benefits" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_memberships_user_id" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_collar_devices_pet_id" ON "collar_devices" USING btree ("pet_id");--> statement-breakpoint
CREATE INDEX "idx_desktop_pet_bindings_device_created_at" ON "desktop_pet_bindings" USING btree ("desktop_device_id","created_at" desc) WHERE "desktop_pet_bindings"."unbound_at" is null;--> statement-breakpoint
CREATE INDEX "idx_desktop_pet_bindings_pet_id" ON "desktop_pet_bindings" USING btree ("pet_id") WHERE "desktop_pet_bindings"."unbound_at" is null;--> statement-breakpoint
CREATE INDEX "idx_pet_avatar_actions_avatar_sort_order" ON "pet_avatar_actions" USING btree ("pet_avatar_id","sort_order","id");--> statement-breakpoint
CREATE INDEX "idx_pet_avatars_pet_created_at" ON "pet_avatars" USING btree ("pet_id","created_at" desc);
