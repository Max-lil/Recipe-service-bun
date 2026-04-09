import { asc, eq } from "drizzle-orm";
import { db } from "../../db/drizzle/index";
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

type GroupedIngredient = {
  name: string;
  quantity: number;
  unit: string;
};

type ShoppingListResponseRow = Omit<
  typeof shoppingListItem.$inferSelect,
  "quantity"
> & {
  quantity: number | null;
};

const normalizeGroupingValue = (value: string) => value.trim().toLowerCase();

const compareIngredientNames = (leftName: string, rightName: string) => {
  return leftName.localeCompare(rightName, undefined, {
    sensitivity: "base",
  });
};

export const buildShoppingListItemsForWeekPlan = (
  weekPlanId: number,
  ingredientRows: WeekPlanIngredientRow[],
): ShoppingListInsertRow[] => {
  const groupedIngredients = new Map<string, GroupedIngredient>();

  for (const ingredientRow of ingredientRows) {
    const name = ingredientRow.name.trim() || ingredientRow.name;
    const unit = ingredientRow.unit.trim() || ingredientRow.unit;
    const key = `${normalizeGroupingValue(name)}::${normalizeGroupingValue(unit)}`;
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

  const shoppingListItems: ShoppingListInsertRow[] = [];

  groupedIngredients.forEach((groupedIngredient) => {
    shoppingListItems.push({
      checked: false,
      name: groupedIngredient.name,
      quantity: groupedIngredient.quantity,
      unit: groupedIngredient.unit,
      weekPlanId,
    });
  });

  shoppingListItems.sort((leftItem, rightItem) =>
    compareIngredientNames(leftItem.name, rightItem.name),
  );

  return shoppingListItems;
};

export const getShoppingListByWeekPlanId = async (
  weekPlanId: number,
): Promise<ShoppingListResponseRow[]> => {
  const shoppingListRows = await db
    .select()
    .from(shoppingListItem)
    .where(eq(shoppingListItem.weekPlanId, weekPlanId))
    .orderBy(asc(shoppingListItem.name));

  const shoppingList = shoppingListRows.map((shoppingListRow) => {
    return {
      ...shoppingListRow,
      quantity:
        shoppingListRow.quantity === 0 ? null : shoppingListRow.quantity,
    };
  });

  shoppingList.sort((leftItem, rightItem) =>
    compareIngredientNames(leftItem.name, rightItem.name),
  );

  return shoppingList;
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
    .where(eq(dayPlan.weekPlanId, weekPlanId))
    .orderBy(asc(ingredient.name));

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
