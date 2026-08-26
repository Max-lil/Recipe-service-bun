-- Recipes are becoming per-user (see fk_recipes_user_id / uk_recipes_user_url in the
-- next migration). Existing recipes/ingredients predate that and have no owner, and
-- were agreed to be disposable pre-launch test data rather than backfilled.
UPDATE "day_plan" SET "recipe_id" = NULL WHERE "recipe_id" IS NOT NULL;
DELETE FROM "ingredient";
DELETE FROM "recipes";
