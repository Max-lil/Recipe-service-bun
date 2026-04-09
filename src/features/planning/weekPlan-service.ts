import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../../db/drizzle/index";
import { dayPlan, recipes, weekPlan } from "../../db/drizzle/schema";
import { syncShoppingListForWeekPlan } from "../shoppinglist/shoppinglist-service";
import type {
  ApiWeekPlanDayResponseSchema,
  ApiWeekPlanRequestSchema,
  ApiWeekPlanResponseSchema,
  ApiWeekPlanSaveSchema,
} from "./weekPlan-model";

type DatabaseClient = typeof db;

type StoredWeekPlanRow = {
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

const getTransactionDatabase = (transaction: unknown): DatabaseClient => {
  return transaction as DatabaseClient;
};

const mapWeekPlanDay = (
  dayRow: StoredWeekPlanDayRow,
): ApiWeekPlanDayResponseSchema => {
  if (dayRow.recipeId === null || dayRow.recipeTitle === null) {
    return {
      id: dayRow.id,
      plannedDate: dayRow.plannedDate,
      recipe: null,
    };
  }

  return {
    id: dayRow.id,
    plannedDate: dayRow.plannedDate,
    recipe: {
      id: dayRow.recipeId,
      title: dayRow.recipeTitle,
      url: dayRow.recipeUrl,
    },
  };
};

const mapWeekPlanResponse = (
  storedWeekPlan: StoredWeekPlanRow,
  dayRows: StoredWeekPlanDayRow[],
): ApiWeekPlanResponseSchema => {
  const days: ApiWeekPlanDayResponseSchema[] = [];

  for (const dayRow of dayRows) {
    days.push(mapWeekPlanDay(dayRow));
  }

  return {
    id: storedWeekPlan.id,
    weekStartDate: storedWeekPlan.weekStartDate,
    status: storedWeekPlan.status,
    days,
  };
};

const getWeekPlanRow = async (
  database: DatabaseClient,
  data: ApiWeekPlanRequestSchema,
): Promise<StoredWeekPlanRow | null> => {
  const weekPlanRows = await database
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

  return weekPlanRows[0] ?? null;
};

const getWeekPlanDayRows = async (
  database: DatabaseClient,
  weekPlanId: number,
): Promise<StoredWeekPlanDayRow[]> => {
  const dayRows = await database
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

  return dayRows;
};

const createWeekPlanRow = async (
  database: DatabaseClient,
  data: ApiWeekPlanRequestSchema,
): Promise<StoredWeekPlanRow> => {
  const weekPlanRows = await database
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

  return weekPlanRows[0];
};

export const getSavedWeekPlan = async (
  data: ApiWeekPlanRequestSchema,
): Promise<ApiWeekPlanResponseSchema | null> => {
  const weekPlanRow = await getWeekPlanRow(db, data);

  if (!weekPlanRow) {
    return null;
  }

  const dayRows = await getWeekPlanDayRows(db, weekPlanRow.id);
  return mapWeekPlanResponse(weekPlanRow, dayRows);
};

export const saveWeekPlan = async (
  data: ApiWeekPlanSaveSchema,
): Promise<ApiWeekPlanResponseSchema> => {
  return db.transaction(async (transaction) => {
    const database = getTransactionDatabase(transaction);
    let weekPlanRow = await getWeekPlanRow(database, data);

    if (!weekPlanRow) {
      weekPlanRow = await createWeekPlanRow(database, data);
    }

    const dayPlanValues = [];

    for (const day of data.days) {
      dayPlanValues.push({
        weekPlanId: weekPlanRow.id,
        plannedDate: day.plannedDate,
        recipeId: day.recipeId,
      });
    }

    await database
      .insert(dayPlan)
      .values(dayPlanValues)
      .onConflictDoUpdate({
        target: [dayPlan.weekPlanId, dayPlan.plannedDate],
        set: {
          recipeId: sql`excluded.recipe_id`,
        },
      });

    await syncShoppingListForWeekPlan(weekPlanRow.id, database);

    const dayRows = await getWeekPlanDayRows(database, weekPlanRow.id);
    return mapWeekPlanResponse(weekPlanRow, dayRows);
  });
};
