import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import {
  recipeCreateSchema,
  recipeScrapeRequestSchema,
} from "./recipe-model";
import { RecipeScrapeError } from "./recipe-scraper";
import * as recipeService from "./recipe-service";
import { requireAuth, type AuthVariables } from "../../utils/require-auth";

const router = new Hono<{ Variables: AuthVariables }>();

router.use("*", requireAuth);

router.get("/", async (c) => {
  const recipes = await recipeService.getAllRecipes(c.get("userId"));
  return c.json(recipes, 200);
});

router.post(
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
      const recipeData = c.req.valid("json");
      const recipe = await recipeService.scrapeAndSaveRecipe(
        recipeData,
        c.get("userId"),
      );
      return c.json(recipe, 200);
    } catch (error) {
      if (error instanceof RecipeScrapeError) {
        return c.json({ message: error.message }, error.status);
      }

      return c.json({ message: "Failed to scrape recipe" }, 500);
    }
  },
);

router.post(
  "/",
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
    const recipeData = c.req.valid("json");
    const recipe = await recipeService.createRecipe(recipeData, c.get("userId"));
    return c.json(recipe, 201);
  },
);

router.post(
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
    const recipeData = c.req.valid("json");
    const recipe = await recipeService.createRecipe(recipeData, c.get("userId"));
    return c.json(recipe, 201);
  },
);

export default router;
