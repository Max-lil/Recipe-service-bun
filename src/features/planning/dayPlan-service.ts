import { db } from "../../db/drizzle/index";
import { eq } from "drizzle-orm";
import { dayPlan, weekPlan } from "../../db/drizzle/schema";
import { syncShoppingListForWeekPlan } from "../shoppinglist/shoppinglist-service";
import type {
  ApiDayPlanInsertSchema,
  ApiDayPlanSelectSchema,
} from "./dayPlan-model";

const getTransactionDatabase = (transaction: unknown): typeof db => {
  return transaction as typeof db;
};

export const getAllDayPlansForUser = async (
  userId: number,
): Promise<ApiDayPlanSelectSchema[]> => {
  const dayPlanRows = await db
    .select({
      id: dayPlan.id,
      plannedDate: dayPlan.plannedDate,
      recipeId: dayPlan.recipeId,
      weekPlanId: dayPlan.weekPlanId,
    })
    .from(dayPlan)
    .innerJoin(weekPlan, eq(dayPlan.weekPlanId, weekPlan.id))
    .where(eq(weekPlan.userId, userId));

  return dayPlanRows;
};

// Returns the id of the user who owns the given day plan (via its week
// plan), or null if the day plan doesn't exist. Used to authorize
// PUT/DELETE on a day plan's recipe before mutating it.
export const getDayPlanOwnerId = async (
  dayPlanId: number,
): Promise<number | null> => {
  const rows = await db
    .select({ userId: weekPlan.userId })
    .from(dayPlan)
    .innerJoin(weekPlan, eq(dayPlan.weekPlanId, weekPlan.id))
    .where(eq(dayPlan.id, dayPlanId));

  return rows[0]?.userId ?? null;
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
