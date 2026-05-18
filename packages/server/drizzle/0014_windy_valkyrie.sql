CREATE TYPE "public"."dispatch_source" AS ENUM('manual', 'auto_full');--> statement-breakpoint
CREATE TYPE "public"."firmware_state" AS ENUM('draft', 'internal', 'released', 'quarantine');--> statement-breakpoint
CREATE TABLE "device_registry" (
	"chip_id" text PRIMARY KEY NOT NULL,
	"online" boolean DEFAULT false NOT NULL,
	"fw" text,
	"ip" text,
	"rssi" integer,
	"free_heap" bigint,
	"mac" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispatch_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"chip_ids" jsonb NOT NULL,
	"source" "dispatch_source" DEFAULT 'manual' NOT NULL,
	"dispatched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"total_count" integer NOT NULL,
	"immediate_count" integer NOT NULL,
	"throttled_count" integer NOT NULL,
	"created_by" text,
	CONSTRAINT "dispatch_jobs_total_count_check" CHECK ("dispatch_jobs"."total_count" >= 0),
	CONSTRAINT "dispatch_jobs_immediate_count_check" CHECK ("dispatch_jobs"."immediate_count" >= 0),
	CONSTRAINT "dispatch_jobs_throttled_count_check" CHECK ("dispatch_jobs"."throttled_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "firmware_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"state" "firmware_state" DEFAULT 'draft' NOT NULL,
	"sha256" text NOT NULL,
	"size" bigint NOT NULL,
	"storage_key" text NOT NULL,
	"release_note" text,
	"force" boolean DEFAULT false NOT NULL,
	"min_from_version" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uploaded_by_token_id" text,
	"quarantined_at" timestamp with time zone,
	"quarantined_reason" text,
	CONSTRAINT "firmware_versions_sha256_check" CHECK (length("firmware_versions"."sha256") = 64),
	CONSTRAINT "firmware_versions_size_check" CHECK ("firmware_versions"."size" > 0)
);
--> statement-breakpoint
CREATE TABLE "internal_devices" (
	"chip_id" text PRIMARY KEY NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"added_by" text NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "ota_progress" (
	"id" text PRIMARY KEY NOT NULL,
	"chip_id" text NOT NULL,
	"version" text NOT NULL,
	"stage" text NOT NULL,
	"percent" integer,
	"code" text,
	"reason" text,
	"device_ts" bigint NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ota_progress_percent_check" CHECK ("ota_progress"."percent" IS NULL OR ("ota_progress"."percent" >= 0 AND "ota_progress"."percent" <= 100))
);
--> statement-breakpoint
CREATE TABLE "ota_rollbacks" (
	"id" text PRIMARY KEY NOT NULL,
	"chip_id" text NOT NULL,
	"version" text NOT NULL,
	"code" text,
	"reason" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seen_count" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "ota_rollbacks_seen_count_check" CHECK ("ota_rollbacks"."seen_count" > 0)
);
--> statement-breakpoint
CREATE TABLE "ota_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"token_prefix" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "firmware_versions" ADD CONSTRAINT "firmware_versions_uploaded_by_token_id_ota_tokens_id_fk" FOREIGN KEY ("uploaded_by_token_id") REFERENCES "public"."ota_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_device_registry_online_fw" ON "device_registry" USING btree ("online","fw");--> statement-breakpoint
CREATE INDEX "idx_device_registry_last_seen_at" ON "device_registry" USING btree ("last_seen_at" desc);--> statement-breakpoint
CREATE INDEX "idx_dispatch_jobs_version_dispatched_at" ON "dispatch_jobs" USING btree ("version","dispatched_at" desc);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_firmware_versions_version" ON "firmware_versions" USING btree ("version");--> statement-breakpoint
CREATE INDEX "idx_firmware_versions_state_version" ON "firmware_versions" USING btree ("state","version");--> statement-breakpoint
CREATE INDEX "idx_ota_progress_chip_id" ON "ota_progress" USING btree ("chip_id");--> statement-breakpoint
CREATE INDEX "idx_ota_progress_chip_version_received" ON "ota_progress" USING btree ("chip_id","version","received_at" desc);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_ota_progress_dedupe" ON "ota_progress" USING btree ("chip_id","version","stage","device_ts");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_ota_rollbacks_chip_id_version" ON "ota_rollbacks" USING btree ("chip_id","version");--> statement-breakpoint
CREATE INDEX "idx_ota_rollbacks_version_last_seen" ON "ota_rollbacks" USING btree ("version","last_seen_at" desc);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_ota_tokens_token_hash" ON "ota_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_ota_tokens_revoked_at" ON "ota_tokens" USING btree ("revoked_at");
