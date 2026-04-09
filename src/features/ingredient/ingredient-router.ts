import { Hono } from "hono";
import * as ingredientService from "./ingredient-service";

const router = new Hono();

router.get("/:recipeId", async (c) => {
  const recipeId = Number(c.req.param("recipeId"));
  const ingredients = await ingredientService.getAllIngredientsByRecipeId(
    recipeId,
  );

  return c.json(ingredients);
});

export default router;
