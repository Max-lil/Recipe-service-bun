import { db } from "../../db/drizzle";
import { dayPlan } from "../../db/drizzle/schema";
import { eq } from "drizzle-orm";
import {
  ApiDayPlanInsertSchema,
  ApiDayPlanSelectSchema,
} from "./dayPlan-model";
import { date } from "zod";

export const getAllDayPlans = async (): Promise<ApiDayPlanSelectSchema[]> => {
  return db.select().from(dayPlan);
};

export const assingRecipeToDayPlan = async (data: ApiDayPlanInsertSchema) => {
  const [dayPlanRow] = await db
    .update(dayPlan)
    .set({
      recipeId: data.recipeId,
    })
    .where(eq(dayPlan.id, data.id!))
    .returning();
  return dayPlanRow;
};

export const deleteRecipeByDayPlanId = async (id: number) => {
  const dayPlanRow = await db
    .update(dayPlan)
    .set({ recipeId: null })
    .where(eq(dayPlan.id, id));
  return dayPlanRow;
};
