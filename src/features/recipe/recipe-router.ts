import { Hono } from "hono";
import * as service from "./recipe-service";
import { zValidator } from "@hono/zod-validator";
import { recipeCreateSchema, recipeScrapeRequestSchema } from "./recipe-model";
import { RecipeScrapeError } from "./recipe-scraper";

const app = new Hono();

app.get("/", async (c) => {
  const recipes = await service.getAllRecipes();
  return c.json(recipes, 200);
});

app.post(
  "/scrape",
  zValidator("json", recipeScrapeRequestSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          message: "Invalid request body",
          errors: result.error,
        },
        400,
      );
    }
  }),
  async (c) => {
    try {
      const payload = c.req.valid("json");
      const recipe = await service.scrapeAndSaveRecipe(payload);
      return c.json(recipe, 200);
    } catch (error) {
      if (error instanceof RecipeScrapeError) {
        return c.json({ message: error.message }, error.status);
      }

      return c.json({ message: "Failed to scrape recipe" }, 500);
    }
  },
);

app.post(
  "/add",
  zValidator("json", recipeCreateSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          message: "Invalid request body",
          errors: result.error,
        },
        400,
      );
    }
  }),
  async (c) => {
    const payload = c.req.valid("json");
    const recipe = await service.createRecipe(payload);
    return c.json(recipe, 201);
  },
);

export default app;
