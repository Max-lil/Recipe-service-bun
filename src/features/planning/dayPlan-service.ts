import { db } from "../../db/drizzle/index";
import { eq } from "drizzle-orm";
import { dayPlan } from "../../db/drizzle/schema";
import { syncShoppingListForWeekPlan } from "../shoppinglist/shoppinglist-service";
import type {
  ApiDayPlanInsertSchema,
  ApiDayPlanSelectSchema,
} from "./dayPlan-model";

const getTransactionDatabase = (transaction: unknown): typeof db => {
  return transaction as typeof db;
};

export const getAllDayPlans = async (): Promise<ApiDayPlanSelectSchema[]> => {
  const dayPlanRows = await db.select().from(dayPlan);
  return dayPlanRows;
};

const updateDayPlanRecipe = async (
  database: typeof db,
  dayPlanId: number,
  recipeId: number | null,
): Promise<ApiDayPlanSelectSchema | null> => {
  const dayPlanRows = await database
    .update(dayPlan)
    .set({ recipeId })
    .where(eq(dayPlan.id, dayPlanId))
    .returning();

  return dayPlanRows[0] ?? null;
};

export const assignRecipeToDayPlan = async (
  data: ApiDayPlanInsertSchema,
): Promise<ApiDayPlanSelectSchema | null> => {
  return db.transaction(async (transaction) => {
    const database = getTransactionDatabase(transaction);
    const dayPlanRow = await updateDayPlanRecipe(
      database,
      data.id,
      data.recipeId,
    );

    if (!dayPlanRow) {
      return dayPlanRow;
    }

    await syncShoppingListForWeekPlan(dayPlanRow.weekPlanId, database);

    return dayPlanRow;
  });
};

export const deleteRecipeByDayPlanId = async (
  dayPlanId: number,
): Promise<ApiDayPlanSelectSchema | null> => {
  return db.transaction(async (transaction) => {
    const database = getTransactionDatabase(transaction);
    const dayPlanRow = await updateDayPlanRecipe(database, dayPlanId, null);

    if (!dayPlanRow) {
      return dayPlanRow;
    }

    await syncShoppingListForWeekPlan(dayPlanRow.weekPlanId, database);

    return dayPlanRow;
  });
};
