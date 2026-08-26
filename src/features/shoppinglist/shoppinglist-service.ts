import { asc, eq } from "drizzle-orm";
import { db } from "../../db/drizzle/index";
import {
  dayPlan,
  ingredient,
  shoppingListItem,
  weekPlan,
} from "../../db/drizzle/schema";
import type { ApiShoppingListManualItemSchema } from "./shoppinglist-model";

// Returns the id of the user who owns the given week plan, or null if it
// doesn't exist. Used to authorize access to a week's shopping list before
// reading or writing it.
export const getWeekPlanOwnerId = async (
  weekPlanId: number,
): Promise<number | null> => {
  const rows = await db
    .select({ userId: weekPlan.userId })
    .from(weekPlan)
    .where(eq(weekPlan.id, weekPlanId));

  return rows[0]?.userId ?? null;
};

type WeekPlanIngredientRow = {
  name: string;
  quantity: number | null;
  unit: string;
};

type ShoppingListInsertRow = {
  checked: boolean;
  name: string;
  quantity: number;
  manualQuantity: number;
  unit: string;
  weekPlanId: number;
};

type GroupedIngredient = {
  name: string;
  quantity: number;
  manualQuantity: number;
  unit: string;
};

type ShoppingListResponseRow = Omit<
  typeof shoppingListItem.$inferSelect,
  "manualQuantity" | "quantity"
> & {
  quantity: number | null;
};

const normalizeGroupingValue = (value: string) => value.trim().toLowerCase();

const getGroupingKey = (name: string, unit: string) => {
  return `${normalizeGroupingValue(name)}::${normalizeGroupingValue(unit)}`;
};

const getStoredQuantity = (quantity: number | null) => quantity ?? 0;

const mapShoppingListResponseRow = (
  shoppingListRow: typeof shoppingListItem.$inferSelect,
): ShoppingListResponseRow => {
  return {
    id: shoppingListRow.id,
    checked: shoppingListRow.checked,
    name: shoppingListRow.name,
    quantity: shoppingListRow.quantity === 0 ? null : shoppingListRow.quantity,
    unit: shoppingListRow.unit,
    weekPlanId: shoppingListRow.weekPlanId,
  };
};

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
    const key = getGroupingKey(name, unit);
    const quantity = getStoredQuantity(ingredientRow.quantity);
    const existingIngredient = groupedIngredients.get(key);

    if (existingIngredient) {
      existingIngredient.quantity += quantity;
      continue;
    }

    groupedIngredients.set(key, {
      name,
      quantity,
      manualQuantity: 0,
      unit,
    });
  }

  const shoppingListItems: ShoppingListInsertRow[] = [];

  groupedIngredients.forEach((groupedIngredient) => {
    shoppingListItems.push({
      checked: false,
      name: groupedIngredient.name,
      quantity: groupedIngredient.quantity,
      manualQuantity: groupedIngredient.manualQuantity,
      unit: groupedIngredient.unit,
      weekPlanId,
    });
  });

  shoppingListItems.sort((leftItem, rightItem) =>
    compareIngredientNames(leftItem.name, rightItem.name),
  );

  return shoppingListItems;
};

export const buildSyncedShoppingListItemsForWeekPlan = (
  weekPlanId: number,
  ingredientRows: WeekPlanIngredientRow[],
  existingShoppingListRows: Array<
    Pick<typeof shoppingListItem.$inferSelect, "manualQuantity" | "name" | "unit">
  >,
): ShoppingListInsertRow[] => {
  const shoppingListItems = buildShoppingListItemsForWeekPlan(
    weekPlanId,
    ingredientRows,
  );
  const groupedItems = new Map<string, ShoppingListInsertRow>();

  for (const shoppingListItem of shoppingListItems) {
    groupedItems.set(
      getGroupingKey(shoppingListItem.name, shoppingListItem.unit),
      shoppingListItem,
    );
  }

  for (const existingShoppingListRow of existingShoppingListRows) {
    if (existingShoppingListRow.manualQuantity <= 0) {
      continue;
    }

    const key = getGroupingKey(
      existingShoppingListRow.name,
      existingShoppingListRow.unit,
    );
    const existingItem = groupedItems.get(key);

    if (existingItem) {
      existingItem.quantity += existingShoppingListRow.manualQuantity;
      existingItem.manualQuantity += existingShoppingListRow.manualQuantity;
      continue;
    }

    const name =
      existingShoppingListRow.name.trim() || existingShoppingListRow.name;
    const unit =
      existingShoppingListRow.unit.trim() || existingShoppingListRow.unit;

    groupedItems.set(key, {
      checked: false,
      name,
      quantity: existingShoppingListRow.manualQuantity,
      manualQuantity: existingShoppingListRow.manualQuantity,
      unit,
      weekPlanId,
    });
  }

  const mergedShoppingListItems = Array.from(groupedItems.values());

  mergedShoppingListItems.sort((leftItem, rightItem) =>
    compareIngredientNames(leftItem.name, rightItem.name),
  );

  return mergedShoppingListItems;
};

export const getShoppingListByWeekPlanId = async (
  weekPlanId: number,
): Promise<ShoppingListResponseRow[]> => {
  const shoppingListRows = await db
    .select()
    .from(shoppingListItem)
    .where(eq(shoppingListItem.weekPlanId, weekPlanId))
    .orderBy(asc(shoppingListItem.name));

  const shoppingList = shoppingListRows.map(mapShoppingListResponseRow);

  shoppingList.sort((leftItem, rightItem) =>
    compareIngredientNames(leftItem.name, rightItem.name),
  );

  return shoppingList;
};

export const addManualShoppingListItem = async (
  weekPlanId: number,
  shoppingListItemData: ApiShoppingListManualItemSchema,
  database: typeof db = db,
): Promise<ShoppingListResponseRow> => {
  const name = shoppingListItemData.name.trim();
  const unit = shoppingListItemData.unit.trim();
  const quantity = getStoredQuantity(shoppingListItemData.quantity);
  const shoppingListRows = await database
    .select()
    .from(shoppingListItem)
    .where(eq(shoppingListItem.weekPlanId, weekPlanId))
    .orderBy(asc(shoppingListItem.name));

  const existingShoppingListItem = shoppingListRows.find((row) => {
    return getGroupingKey(row.name, row.unit) === getGroupingKey(name, unit);
  });

  if (existingShoppingListItem) {
    const updatedRows = await database
      .update(shoppingListItem)
      .set({
        manualQuantity: existingShoppingListItem.manualQuantity + quantity,
        quantity: existingShoppingListItem.quantity + quantity,
      })
      .where(eq(shoppingListItem.id, existingShoppingListItem.id))
      .returning();

    return mapShoppingListResponseRow(updatedRows[0]);
  }

  const insertedRows = await database
    .insert(shoppingListItem)
    .values({
      checked: false,
      name,
      quantity,
      manualQuantity: quantity,
      unit,
      weekPlanId,
    })
    .returning();

  return mapShoppingListResponseRow(insertedRows[0]);
};

export const syncShoppingListForWeekPlan = async (
  weekPlanId: number,
  database: typeof db = db,
) => {
  const existingShoppingListRows = await database
    .select()
    .from(shoppingListItem)
    .where(eq(shoppingListItem.weekPlanId, weekPlanId))
    .orderBy(asc(shoppingListItem.name));

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

  const shoppingListItems = buildSyncedShoppingListItemsForWeekPlan(
    weekPlanId,
    ingredientRows,
    existingShoppingListRows,
  );

  await database
    .delete(shoppingListItem)
    .where(eq(shoppingListItem.weekPlanId, weekPlanId));

  if (shoppingListItems.length === 0) {
    return [];
  }

  return database.insert(shoppingListItem).values(shoppingListItems).returning();
};
