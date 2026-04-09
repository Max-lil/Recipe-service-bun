import { eq } from "drizzle-orm";
import { db } from "../../db/drizzle/index";
import { ingredient } from "../../db/drizzle/schema";
import type { ApiIngredientSelectSchema } from "./ingredient-model";

export const getAllIngredientsByRecipeId = async (
  recipeId: number,
): Promise<ApiIngredientSelectSchema[]> => {
  const ingredientRows = await db
    .select()
    .from(ingredient)
    .where(eq(ingredient.recipeId, recipeId));

  return ingredientRows;
};
