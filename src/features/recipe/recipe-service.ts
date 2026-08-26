import { and, eq } from "drizzle-orm";
import { db } from "../../db/drizzle/index";
import { dayPlan, ingredient, recipes } from "../../db/drizzle/schema";
import { syncShoppingListForWeekPlan } from "../shoppinglist/shoppinglist-service";
import type {
  ApiRecipeCreateSchema,
  ApiRecipeSavedIngredientSchema,
  ApiRecipeSavedSchema,
  ApiRecipeScrapeRequestSchema,
  ApiRecipeScrapeResponseSchema,
} from "./recipe-model";
import {
  scrapeRecipeFromUrl,
  type ScrapedIngredient,
  type ScrapedRecipe,
} from "./recipe-scraper";

type DatabaseClient = typeof db;

type SavedRecipeRow = {
  id: number;
  title: string;
  url: string | null;
  ingredientsRaw: string | null;
};

const getTransactionDatabase = (transaction: unknown): DatabaseClient => {
  return transaction as DatabaseClient;
};

const mapSavedRecipe = (recipeRow: SavedRecipeRow): ApiRecipeSavedSchema => {
  return {
    id: recipeRow.id,
    title: recipeRow.title,
    url: recipeRow.url,
    ingredientsRaw: recipeRow.ingredientsRaw,
  };
};

const buildIngredientRows = (
  recipeId: number,
  scrapedIngredients: ScrapedIngredient[],
) => {
  const ingredientRows = [];

  for (const scrapedIngredient of scrapedIngredients) {
    ingredientRows.push({
      recipeId,
      name: scrapedIngredient.name,
      quantity: scrapedIngredient.quantity,
      unit: scrapedIngredient.unit,
      rawText: scrapedIngredient.rawText,
    });
  }

  return ingredientRows;
};

const getRecipeByUrl = async (
  database: DatabaseClient,
  recipeUrl: string,
  userId: number,
): Promise<SavedRecipeRow | null> => {
  const recipeRows = await database
    .select({
      id: recipes.id,
      title: recipes.title,
      url: recipes.url,
      ingredientsRaw: recipes.ingredientsRaw,
    })
    .from(recipes)
    .where(and(eq(recipes.url, recipeUrl), eq(recipes.userId, userId)));

  return recipeRows[0] ?? null;
};

const saveRecipeIngredients = async (
  database: DatabaseClient,
  recipeId: number,
  scrapedIngredients: ScrapedIngredient[],
): Promise<ApiRecipeSavedIngredientSchema[]> => {
  const ingredientRows = buildIngredientRows(recipeId, scrapedIngredients);

  if (ingredientRows.length === 0) {
    return [];
  }

  return database.insert(ingredient).values(ingredientRows).returning();
};

const getRecipeTitle = (
  recipeData: ApiRecipeScrapeRequestSchema,
  scrapedRecipe: ScrapedRecipe,
  existingRecipe: SavedRecipeRow | null,
) => {
  const providedTitle = recipeData.title?.trim();

  if (providedTitle) {
    return providedTitle;
  }

  if (scrapedRecipe.title) {
    return scrapedRecipe.title;
  }

  if (existingRecipe?.title) {
    return existingRecipe.title;
  }

  return "Unknown recipe";
};

const buildScrapeResponse = (
  recipeRow: SavedRecipeRow,
  savedIngredients: ApiRecipeSavedIngredientSchema[],
): ApiRecipeScrapeResponseSchema => {
  return {
    recipe: mapSavedRecipe(recipeRow),
    ingredients: savedIngredients,
  };
};

const saveNewScrapedRecipe = async (
  database: DatabaseClient,
  recipeUrl: string,
  recipeTitle: string,
  scrapedRecipe: ScrapedRecipe,
  userId: number,
): Promise<ApiRecipeScrapeResponseSchema> => {
  const savedRecipeRows = await database
    .insert(recipes)
    .values({
      title: recipeTitle,
      url: recipeUrl,
      ingredientsRaw: scrapedRecipe.ingredientsRaw,
      userId,
    })
    .returning({
      id: recipes.id,
      title: recipes.title,
      url: recipes.url,
      ingredientsRaw: recipes.ingredientsRaw,
    });

  const savedRecipe = savedRecipeRows[0];

  if (!savedRecipe) {
    throw new Error("Failed to save recipe");
  }

  const savedIngredients = await saveRecipeIngredients(
    database,
    savedRecipe.id,
    scrapedRecipe.ingredients,
  );

  return buildScrapeResponse(savedRecipe, savedIngredients);
};

const updateScrapedRecipe = async (
  database: DatabaseClient,
  existingRecipe: SavedRecipeRow,
  recipeTitle: string,
  scrapedRecipe: ScrapedRecipe,
): Promise<ApiRecipeScrapeResponseSchema> => {
  const updatedRecipeRows = await database
    .update(recipes)
    .set({
      title: recipeTitle,
      ingredientsRaw: scrapedRecipe.ingredientsRaw,
    })
    .where(eq(recipes.id, existingRecipe.id))
    .returning({
      id: recipes.id,
      title: recipes.title,
      url: recipes.url,
      ingredientsRaw: recipes.ingredientsRaw,
    });

  const updatedRecipe = updatedRecipeRows[0];

  if (!updatedRecipe) {
    throw new Error("Failed to update recipe");
  }

  await database.delete(ingredient).where(eq(ingredient.recipeId, existingRecipe.id));

  const updatedIngredients = await saveRecipeIngredients(
    database,
    updatedRecipe.id,
    scrapedRecipe.ingredients,
  );

  await syncShoppingListsForRecipe(updatedRecipe.id, database);

  return buildScrapeResponse(updatedRecipe, updatedIngredients);
};

const syncShoppingListsForRecipe = async (
  recipeId: number,
  database: DatabaseClient,
) => {
  const weekPlanRows = await database
    .select({
      weekPlanId: dayPlan.weekPlanId,
    })
    .from(dayPlan)
    .where(eq(dayPlan.recipeId, recipeId));

  const uniqueWeekPlanIds: number[] = [];

  for (const weekPlanRow of weekPlanRows) {
    if (!uniqueWeekPlanIds.includes(weekPlanRow.weekPlanId)) {
      uniqueWeekPlanIds.push(weekPlanRow.weekPlanId);
    }
  }

  for (const weekPlanId of uniqueWeekPlanIds) {
    await syncShoppingListForWeekPlan(weekPlanId, database);
  }
};

export const getAllRecipes = async (
  userId: number,
): Promise<ApiRecipeSavedSchema[]> => {
  const recipeRows = await db
    .select({
      id: recipes.id,
      title: recipes.title,
      url: recipes.url,
      ingredientsRaw: recipes.ingredientsRaw,
    })
    .from(recipes)
    .where(eq(recipes.userId, userId));

  return recipeRows;
};

export const createRecipe = async (
  recipeData: ApiRecipeCreateSchema,
  userId: number,
): Promise<ApiRecipeSavedSchema> => {
  const savedRecipeRows = await db
    .insert(recipes)
    .values({
      title: recipeData.title,
      url: recipeData.url,
      userId,
    })
    .returning({
      id: recipes.id,
      title: recipes.title,
      url: recipes.url,
      ingredientsRaw: recipes.ingredientsRaw,
    });

  const savedRecipe = savedRecipeRows[0];

  if (!savedRecipe) {
    throw new Error("Failed to create recipe");
  }

  return mapSavedRecipe(savedRecipe);
};

// Returns the id of the user who owns the given recipe, or null if the
// recipe doesn't exist. Used to authorize access to a recipe's ingredients
// before reading them.
export const getRecipeOwnerId = async (
  recipeId: number,
): Promise<number | null> => {
  const rows = await db
    .select({ userId: recipes.userId })
    .from(recipes)
    .where(eq(recipes.id, recipeId));

  return rows[0]?.userId ?? null;
};

export const scrapeAndSaveRecipe = async (
  recipeData: ApiRecipeScrapeRequestSchema,
  userId: number,
): Promise<ApiRecipeScrapeResponseSchema> => {
  const recipeUrl = recipeData.url.trim();
  const existingRecipe = await getRecipeByUrl(db, recipeUrl, userId);
  const scrapedRecipe = await scrapeRecipeFromUrl(recipeUrl);
  const recipeTitle = getRecipeTitle(recipeData, scrapedRecipe, existingRecipe);

  return db.transaction(async (transaction) => {
    const database = getTransactionDatabase(transaction);

    if (existingRecipe) {
      return updateScrapedRecipe(
        database,
        existingRecipe,
        recipeTitle,
        scrapedRecipe,
      );
    }

    return saveNewScrapedRecipe(
      database,
      recipeUrl,
      recipeTitle,
      scrapedRecipe,
      userId,
    );
  });
};
