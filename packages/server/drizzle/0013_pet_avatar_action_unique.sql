DELETE FROM "pet_avatar_actions" duplicate
USING "pet_avatar_actions" kept
WHERE duplicate."pet_avatar_id" = kept."pet_avatar_id"
  AND duplicate."action_type" = kept."action_type"
  AND (
    duplicate."sort_order" < kept."sort_order"
    OR (
      duplicate."sort_order" = kept."sort_order"
      AND duplicate."id" < kept."id"
    )
  );--> statement-breakpoint
CREATE UNIQUE INDEX "uq_pet_avatar_actions_avatar_action_type" ON "pet_avatar_actions" USING btree ("pet_avatar_id","action_type");
