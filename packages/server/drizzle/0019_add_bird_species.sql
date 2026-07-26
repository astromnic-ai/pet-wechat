ALTER TYPE "public"."species" ADD VALUE IF NOT EXISTS 'bird';

UPDATE "behavior_schedules"
SET "species" = 'bird'
WHERE "species" = 'other';
