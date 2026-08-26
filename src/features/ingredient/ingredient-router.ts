import { Hono } from "hono";
import * as ingredientService from "./ingredient-service";
import * as recipeService from "../recipe/recipe-service";
import { requireAuth, type AuthVariables } from "../../utils/require-auth";

const router = new Hono<{ Variables: AuthVariables }>();

router.use("*", requireAuth);

router.get("/:recipeId", async (c) => {
  const recipeId = Number(c.req.param("recipeId"));
  const ownerId = await recipeService.getRecipeOwnerId(recipeId);

  if (ownerId === null) {
    return c.json({ message: "Recipe not found" }, 404);
  }
  if (ownerId !== c.get("userId")) {
    return c.json({ message: "Forbidden" }, 403);
  }

  const ingredients = await ingredientService.getAllIngredientsByRecipeId(
    recipeId,
  );

  return c.json(ingredients);
});

export default router;
