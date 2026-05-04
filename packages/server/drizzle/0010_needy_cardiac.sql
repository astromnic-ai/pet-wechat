ALTER TYPE "public"."device_claim_status" ADD VALUE 'unclaimed' BEFORE 'reset_required';--> statement-breakpoint
ALTER TABLE "collar_devices" ADD COLUMN "chip_id" text;--> statement-breakpoint
ALTER TABLE "desktop_devices" ADD COLUMN "chip_id" text;--> statement-breakpoint
ALTER TABLE "pet_avatar_actions" ADD COLUMN "video_url" text;--> statement-breakpoint
ALTER TABLE "pet_avatar_actions" ADD COLUMN "video_hash" text;--> statement-breakpoint
ALTER TABLE "collar_devices" ADD CONSTRAINT "collar_devices_chip_id_unique" UNIQUE("chip_id");--> statement-breakpoint
ALTER TABLE "desktop_devices" ADD CONSTRAINT "desktop_devices_chip_id_unique" UNIQUE("chip_id");