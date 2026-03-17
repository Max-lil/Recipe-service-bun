import { Hono } from "hono";
import * as service from "./ingredient-service";

export const app = new Hono();

app.get("/:recipeId", async (c) => {
  const recipeId = c.req.param("recipeId");
  const response = await service.getAllIngredientsByRecipeId(Number(recipeId));
  return c.json(response);
});

export default app;
