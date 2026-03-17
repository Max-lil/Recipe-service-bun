import { db } from "../../db/drizzle";
import { eq } from "drizzle-orm";
import { shoppingListItem } from "../../db/drizzle/schema";

export const getShoppinglistByWeekPlanId = async (id: number) => {
  const ingredients = await db
    .select()
    .from(shoppingListItem)
    .where(eq(shoppingListItem.weekPlanId, id));
  return ingredients;
};
