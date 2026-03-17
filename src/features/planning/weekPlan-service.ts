import { and, asc, eq } from "drizzle-orm";
import { db } from "../../db/drizzle";
import { dayPlan, recipes, weekPlan } from "../../db/drizzle/schema";
import {
  ApiWeekPlanInsertSchema,
  ApiWeekPlanRequestSchema,
  ApiWeekPlanResponseSchema,
} from "./weekPlan-model";
import { ApiDayPlanInsertSchema } from "./dayPlan-model";
import { addDays, format } from "date-fns";

export const getWeekPlanByStartDate = async (
  data: ApiWeekPlanInsertSchema,
): Promise<ApiWeekPlanResponseSchema | null> => {
  let weekPlanBody;
  const existingPlan = await db
    .select()
    .from(weekPlan)
    .where(
      and(
        eq(weekPlan.weekStartDate, data.weekStartDate),
        eq(weekPlan.userId, data.userId),
      ),
    );
  weekPlanBody = existingPlan[0];

  if (!weekPlanBody) {
    const { weekPlanData, dayPlansData } = buildWeekPlanWithDays(data);
    const [newWeekPlan] = await db
      .insert(weekPlan)
      .values(weekPlanData)
      .returning();
    await db
      .insert(dayPlan)
      .values(
        dayPlansData.map((dp) => ({ ...dp, weekPlanId: newWeekPlan.id })),
      );
    weekPlanBody = newWeekPlan;
  }

  const dayRows = await db
    .select({
      id: dayPlan.id,
      plannedDate: dayPlan.plannedDate,
      recipeId: recipes.id,
      recipeTitle: recipes.title,
      recipeUrl: recipes.url,
    })
    .from(dayPlan)
    .leftJoin(recipes, eq(dayPlan.recipeId, recipes.id))
    .where(eq(dayPlan.weekPlanId, weekPlanBody.id))
    .orderBy(asc(dayPlan.plannedDate));

  return {
    id: weekPlanBody.id,
    weekStartDate: weekPlanBody.weekStartDate,
    status: weekPlanBody.status,
    days: dayRows.map((dayRow) => ({
      id: dayRow.id,
      plannedDate: dayRow.plannedDate,
      recipe:
        dayRow.recipeId === null
          ? null
          : {
              id: dayRow.recipeId,
              title: dayRow.recipeTitle!,
              url: dayRow.recipeUrl!,
            },
    })),
  };
};

const buildWeekPlanWithDays = (data: ApiWeekPlanInsertSchema) => {
  const weekPlanData = {
    userId: data.userId,
    weekStartDate: data.weekStartDate,
    status: "PLANNED" as const,
  };
  const dayPlansData = Array.from({ length: 7 }, (_, i) => ({
    plannedDate: format(addDays(data.weekStartDate, i), "yyyy-MM-dd"),
    recipeId: null,
  }));
  return { weekPlanData, dayPlansData };
};
