import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../../db/drizzle";
import { dayPlan, recipes, weekPlan } from "../../db/drizzle/schema";
import { syncShoppingListForWeekPlan } from "../shoppinglist/shoppinglist-service";
import {
  ApiWeekPlanRequestSchema,
  ApiWeekPlanResponseSchema,
  ApiWeekPlanSaveSchema,
} from "./weekPlan-model";

type StoredWeekPlan = {
  id: number;
  userId: number;
  weekStartDate: string;
  status: string | null;
};

type StoredWeekPlanDayRow = {
  id: number;
  plannedDate: string;
  recipeId: number | null;
  recipeTitle: string | null;
  recipeUrl: string | null;
};

const mapWeekPlanResponse = (
  storedWeekPlan: StoredWeekPlan,
  dayRows: StoredWeekPlanDayRow[],
): ApiWeekPlanResponseSchema => ({
  id: storedWeekPlan.id,
  weekStartDate: storedWeekPlan.weekStartDate,
  status: storedWeekPlan.status,
  days: dayRows.map((dayRow) => ({
    id: dayRow.id,
    plannedDate: dayRow.plannedDate,
    recipe:
      dayRow.recipeId === null
        ? null
        : {
            id: dayRow.recipeId,
            title: dayRow.recipeTitle!,
            url: dayRow.recipeUrl,
          },
  })),
});

const getWeekPlanBody = async (
  database: typeof db,
  data: ApiWeekPlanRequestSchema,
) => {
  const weekPlans = await database
    .select({
      id: weekPlan.id,
      userId: weekPlan.userId,
      weekStartDate: weekPlan.weekStartDate,
      status: weekPlan.status,
    })
    .from(weekPlan)
    .where(
      and(
        eq(weekPlan.userId, data.userId),
        eq(weekPlan.weekStartDate, data.weekStartDate),
      ),
    );

  return weekPlans[0] ?? null;
};

const getWeekPlanDayRows = async (database: typeof db, weekPlanId: number) => {
  return database
    .select({
      id: dayPlan.id,
      plannedDate: dayPlan.plannedDate,
      recipeId: recipes.id,
      recipeTitle: recipes.title,
      recipeUrl: recipes.url,
    })
    .from(dayPlan)
    .leftJoin(recipes, eq(dayPlan.recipeId, recipes.id))
    .where(eq(dayPlan.weekPlanId, weekPlanId))
    .orderBy(asc(dayPlan.plannedDate));
};

const createWeekPlanBody = async (
  database: typeof db,
  data: ApiWeekPlanRequestSchema,
) => {
  const [weekPlanBody] = await database
    .insert(weekPlan)
    .values({
      userId: data.userId,
      weekStartDate: data.weekStartDate,
      status: "PLANNED",
    })
    .returning({
      id: weekPlan.id,
      userId: weekPlan.userId,
      weekStartDate: weekPlan.weekStartDate,
      status: weekPlan.status,
    });

  return weekPlanBody;
};

export const getSavedWeekPlan = async (
  data: ApiWeekPlanRequestSchema,
): Promise<ApiWeekPlanResponseSchema | null> => {
  const weekPlanBody = await getWeekPlanBody(db, data);

  if (!weekPlanBody) {
    return null;
  }

  const dayRows = await getWeekPlanDayRows(db, weekPlanBody.id);
  return mapWeekPlanResponse(weekPlanBody, dayRows);
};

export const saveWeekPlan = async (
  data: ApiWeekPlanSaveSchema,
): Promise<ApiWeekPlanResponseSchema> => {
  return db.transaction(async (tx) => {
    const transactionDb = tx as unknown as typeof db;
    let weekPlanBody = await getWeekPlanBody(transactionDb, data);

    if (!weekPlanBody) {
      weekPlanBody = await createWeekPlanBody(transactionDb, data);
    }

    await transactionDb
      .insert(dayPlan)
      .values(
        data.days.map((day) => ({
          weekPlanId: weekPlanBody.id,
          plannedDate: day.plannedDate,
          recipeId: day.recipeId,
        })),
      )
      .onConflictDoUpdate({
        target: [dayPlan.weekPlanId, dayPlan.plannedDate],
        set: {
          recipeId: sql`excluded.recipe_id`,
        },
      });

    await syncShoppingListForWeekPlan(weekPlanBody.id, transactionDb);

    const dayRows = await getWeekPlanDayRows(transactionDb, weekPlanBody.id);
    return mapWeekPlanResponse(weekPlanBody, dayRows);
  });
};
