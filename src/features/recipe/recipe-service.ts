import { eq } from "drizzle-orm";
import { db } from "../../db/drizzle/index";
import { ingredient, recipes } from "../../db/drizzle/schema";
import type {
  ApiRecipeInsertSchema,
  ApiRecipeScrapeRequestSchema,
  ApiRecipeScrapeResponseSchema,
  ApiRecipeSelectSchema,
} from "./recipe-model";
import { scrapeRecipeFromUrl } from "./recipe-scraper";

export const getAllRecipes = async (): Promise<ApiRecipeSelectSchema[]> => {
  return db.select().from(recipes);
};

export const createRecipe = async (data: ApiRecipeInsertSchema) => {
  const [recipeBody] = await db
    .insert(recipes)
    .values({ title: data.title, url: data.url })
    .returning();
  return recipeBody;
};

export const scrapeAndSaveRecipe = async (
  data: ApiRecipeScrapeRequestSchema,
): Promise<ApiRecipeScrapeResponseSchema> => {
  const normalizedUrl = data.url.trim();
  const existingRecipe = await db
    .select()
    .from(recipes)
    .where(eq(recipes.url, normalizedUrl));

  if (existingRecipe[0]) {
    const existingIngredients = await db
      .select()
      .from(ingredient)
      .where(eq(ingredient.recipeId, existingRecipe[0].id));

    return {
      recipe: {
        id: existingRecipe[0].id,
        title: existingRecipe[0].title,
        url: existingRecipe[0].url,
        ingredientsRaw: existingRecipe[0].ingredientsRaw,
      },
      ingredients: existingIngredients,
    };
  }

  const scrapedRecipe = await scrapeRecipeFromUrl(normalizedUrl);
  const recipeTitle = data.title?.trim() || scrapedRecipe.title || "Unknown recipe";

  return db.transaction(async (tx) => {
    const [savedRecipe] = await tx
      .insert(recipes)
      .values({
        title: recipeTitle,
        url: normalizedUrl,
        ingredientsRaw: scrapedRecipe.ingredientsRaw,
      })
      .returning();

    const savedIngredients = await tx
      .insert(ingredient)
      .values(
        scrapedRecipe.ingredients.map((scrapedIngredient) => ({
          recipeId: savedRecipe.id,
          name: scrapedIngredient.name,
          quantity: scrapedIngredient.quantity,
          unit: scrapedIngredient.unit,
          rawText: scrapedIngredient.rawText,
        })),
      )
      .returning();

    return {
      recipe: {
        id: savedRecipe.id,
        title: savedRecipe.title,
        url: savedRecipe.url,
        ingredientsRaw: savedRecipe.ingredientsRaw,
      },
      ingredients: savedIngredients,
    };
  });
};
