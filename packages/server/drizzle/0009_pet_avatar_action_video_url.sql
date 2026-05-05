ALTER TABLE "pet_avatar_actions" ADD COLUMN "video_url" text;

UPDATE "pet_avatar_actions"
SET "video_url" = "image_url"
WHERE "video_url" IS NULL;
