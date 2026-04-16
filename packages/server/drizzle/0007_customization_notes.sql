ALTER TABLE "pet_avatars"
ADD COLUMN IF NOT EXISTS "pet_description" text,
ADD COLUMN IF NOT EXISTS "fun_fact" text;
