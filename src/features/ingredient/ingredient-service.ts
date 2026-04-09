import { db } from "../../db/drizzle";
import { and, asc, eq } from "drizzle-orm";
import { ingredient } from "../../db/drizzle/schema";
import { ApiIngredientSelectSchema } from "./ingredient-model";

export const getAllIngredientsByRecipeId = async (id: number) => {
  const ingredients = await db
    .select()
    .from(ingredient)
    .where(eq(ingredient.recipeId, id));
  return ingredients;
};
