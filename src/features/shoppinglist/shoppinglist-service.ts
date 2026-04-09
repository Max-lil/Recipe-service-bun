import { eq } from "drizzle-orm";
import { db } from "../../db/drizzle";
import {
  dayPlan,
  ingredient,
  shoppingListItem,
} from "../../db/drizzle/schema";

type WeekPlanIngredientRow = {
  name: string;
  quantity: number | null;
  unit: string;
};

type ShoppingListInsertRow = {
  checked: boolean;
  name: string;
  quantity: number;
  unit: string;
  weekPlanId: number;
};

type ShoppingListResponseRow = typeof shoppingListItem.$inferSelect & {
  quantity: number | null;
};

const normalizeValue = (value: string) => value.trim().toLowerCase();

export const buildShoppingListItemsForWeekPlan = (
  weekPlanId: number,
  ingredientRows: WeekPlanIngredientRow[],
): ShoppingListInsertRow[] => {
  const groupedIngredients = new Map<
    string,
    { name: string; quantity: number; unit: string }
  >();

  for (const ingredientRow of ingredientRows) {
    const name = ingredientRow.name.trim() || ingredientRow.name;
    const unit = ingredientRow.unit.trim() || ingredientRow.unit;
    const key = `${normalizeValue(name)}::${normalizeValue(unit)}`;
    const quantity = ingredientRow.quantity ?? 0;
    const existingIngredient = groupedIngredients.get(key);

    if (existingIngredient) {
      existingIngredient.quantity += quantity;
      continue;
    }

    groupedIngredients.set(key, {
      name,
      quantity,
      unit,
    });
  }

  return Array.from(groupedIngredients.values()).map((ingredientRow) => ({
    checked: false,
    name: ingredientRow.name,
    quantity: ingredientRow.quantity,
    unit: ingredientRow.unit,
    weekPlanId,
  }));
};

export const getShoppinglistByWeekPlanId = async (id: number) => {
  const ingredients = await db
    .select()
    .from(shoppingListItem)
    .where(eq(shoppingListItem.weekPlanId, id));

  return ingredients.map<ShoppingListResponseRow>((ingredientRow) => ({
    ...ingredientRow,
    quantity: ingredientRow.quantity === 0 ? null : ingredientRow.quantity,
  }));
};

export const syncShoppingListForWeekPlan = async (
  weekPlanId: number,
  database: typeof db = db,
) => {
  const ingredientRows = await database
    .select({
      name: ingredient.name,
      quantity: ingredient.quantity,
      unit: ingredient.unit,
    })
    .from(dayPlan)
    .innerJoin(ingredient, eq(dayPlan.recipeId, ingredient.recipeId))
    .where(eq(dayPlan.weekPlanId, weekPlanId));

  const shoppingListItems = buildShoppingListItemsForWeekPlan(
    weekPlanId,
    ingredientRows,
  );

  await database
    .delete(shoppingListItem)
    .where(eq(shoppingListItem.weekPlanId, weekPlanId));

  if (shoppingListItems.length === 0) {
    return [];
  }

  return database.insert(shoppingListItem).values(shoppingListItems).returning();
};
