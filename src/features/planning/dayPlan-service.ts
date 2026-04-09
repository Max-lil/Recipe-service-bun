import { db } from "../../db/drizzle";
import { dayPlan } from "../../db/drizzle/schema";
import { eq } from "drizzle-orm";
import { syncShoppingListForWeekPlan } from "../shoppinglist/shoppinglist-service";
import {
  ApiDayPlanInsertSchema,
  ApiDayPlanSelectSchema,
} from "./dayPlan-model";

export const getAllDayPlans = async (): Promise<ApiDayPlanSelectSchema[]> => {
  return db.select().from(dayPlan);
};

export const assingRecipeToDayPlan = async (data: ApiDayPlanInsertSchema) => {
  return db.transaction(async (tx) => {
    const transactionDb = tx as unknown as typeof db;
    const [dayPlanRow] = await transactionDb
      .update(dayPlan)
      .set({
        recipeId: data.recipeId,
      })
      .where(eq(dayPlan.id, data.id!))
      .returning();

    if (!dayPlanRow) {
      return dayPlanRow;
    }

    await syncShoppingListForWeekPlan(dayPlanRow.weekPlanId, transactionDb);

    return dayPlanRow;
  });
};

export const deleteRecipeByDayPlanId = async (id: number) => {
  return db.transaction(async (tx) => {
    const transactionDb = tx as unknown as typeof db;
    const [dayPlanRow] = await transactionDb
      .update(dayPlan)
      .set({ recipeId: null })
      .where(eq(dayPlan.id, id))
      .returning();

    if (!dayPlanRow) {
      return dayPlanRow;
    }

    await syncShoppingListForWeekPlan(dayPlanRow.weekPlanId, transactionDb);

    return dayPlanRow;
  });
};
