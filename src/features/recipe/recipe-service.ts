import { eq } from "drizzle-orm";
import { db } from "../../db/drizzle/index";
import { dayPlan, ingredient, recipes } from "../../db/drizzle/schema";
import type {
  ApiRecipeCreateSchema,
  ApiRecipeScrapeRequestSchema,
  ApiRecipeScrapeResponseSchema,
  ApiRecipeSelectSchema,
} from "./recipe-model";
import { scrapeRecipeFromUrl } from "./recipe-scraper";
import { syncShoppingListForWeekPlan } from "../shoppinglist/shoppinglist-service";

export const getAllRecipes = async (): Promise<ApiRecipeSelectSchema[]> => {
  return db.select().from(recipes);
};

export const createRecipe = async (data: ApiRecipeCreateSchema) => {
  const [recipeBody] = await db
    .insert(recipes)
    .values({ title: data.title, url: data.url })
    .returning({
      id: recipes.id,
      title: recipes.title,
      url: recipes.url,
      ingredientsRaw: recipes.ingredientsRaw,
    });
  return recipeBody;
};

const syncShoppingListsForRecipe = async (
  recipeId: number,
  database: typeof db,
) => {
  const weekPlanRows = await database
    .select({
      weekPlanId: dayPlan.weekPlanId,
    })
    .from(dayPlan)
    .where(eq(dayPlan.recipeId, recipeId));

  const weekPlanIds = Array.from(
    new Set(weekPlanRows.map((row) => row.weekPlanId)),
  );

  for (const weekPlanId of weekPlanIds) {
    await syncShoppingListForWeekPlan(weekPlanId, database);
  }
};

export const scrapeAndSaveRecipe = async (
  data: ApiRecipeScrapeRequestSchema,
): Promise<ApiRecipeScrapeResponseSchema> => {
  const normalizedUrl = data.url.trim();
  const existingRecipe = await db
    .select()
    .from(recipes)
    .where(eq(recipes.url, normalizedUrl));

  const scrapedRecipe = await scrapeRecipeFromUrl(normalizedUrl);
  const recipeTitle =
    data.title?.trim() ||
    scrapedRecipe.title ||
    existingRecipe[0]?.title ||
    "Unknown recipe";

  return db.transaction(async (tx) => {
    if (existingRecipe[0]) {
      const [updatedRecipe] = await tx
        .update(recipes)
        .set({
          title: recipeTitle,
          ingredientsRaw: scrapedRecipe.ingredientsRaw,
        })
        .where(eq(recipes.id, existingRecipe[0].id))
        .returning();

      await tx.delete(ingredient).where(eq(ingredient.recipeId, existingRecipe[0].id));

      const updatedIngredients = await tx
        .insert(ingredient)
        .values(
          scrapedRecipe.ingredients.map((scrapedIngredient) => ({
            recipeId: updatedRecipe.id,
            name: scrapedIngredient.name,
            quantity: scrapedIngredient.quantity,
            unit: scrapedIngredient.unit,
            rawText: scrapedIngredient.rawText,
          })),
        )
        .returning();

      await syncShoppingListsForRecipe(
        updatedRecipe.id,
        tx as unknown as typeof db,
      );

      return {
        recipe: {
          id: updatedRecipe.id,
          title: updatedRecipe.title,
          url: updatedRecipe.url,
          ingredientsRaw: updatedRecipe.ingredientsRaw,
        },
        ingredients: updatedIngredients,
      };
    }

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
