UPDATE "pet_avatar_actions"
SET "video_url" = "image_url"
WHERE "video_url" IS NULL
  AND "image_url" IS NOT NULL;
