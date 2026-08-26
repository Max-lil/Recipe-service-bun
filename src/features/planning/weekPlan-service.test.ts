import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { z } from "zod";
import { dayPlan, recipes, weekPlan } from "../../db/drizzle/schema";

type WeekPlanRow = {
  id: number;
  userId: number;
  weekStartDate: string;
  status: string | null;
};

type DayPlanRow = {
  id: number;
  plannedDate: string;
  recipeId: number | null;
  weekPlanId: number;
};

type RecipeRow = {
  id: number;
  title: string;
  url: string | null;
};

const toPropertyName = (columnName: string) => {
  return columnName.replace(/_([a-z])/g, (_, character: string) =>
    character.toUpperCase(),
  );
};

const isSqlExpression = (value: unknown): value is { queryChunks: unknown[] } => {
  return (
    typeof value === "object" &&
    value !== null &&
    "queryChunks" in value &&
    Array.isArray((value as { queryChunks: unknown[] }).queryChunks)
  );
};

const getComparisons = (condition: { queryChunks: unknown[] }) => {
  const nestedConditions = condition.queryChunks.filter(isSqlExpression);

  if (nestedConditions.length > 0) {
    return nestedConditions.flatMap(getComparisons);
  }

  const column = condition.queryChunks.find((chunk) => {
    return (
      typeof chunk === "object" &&
      chunk !== null &&
      "table" in chunk &&
      "name" in chunk
    );
  }) as { name: string } | undefined;

  const parameter = condition.queryChunks.find((chunk) => {
    return (
      typeof chunk === "object" &&
      chunk !== null &&
      "value" in chunk &&
      "encoder" in chunk
    );
  }) as { value: unknown } | undefined;

  if (!column || !parameter) {
    return [];
  }

  return [
    {
      columnName: column.name,
      value: parameter.value,
    },
  ];
};

const evaluateCondition = (
  row: Record<string, unknown>,
  condition: { queryChunks: unknown[] },
): boolean => {
  return getComparisons(condition).every(({ columnName, value }) => {
    return row[toPropertyName(columnName)] === value;
  });
};

const getSelectedRow = (
  table: unknown,
  valuesByTable: {
    weekPlanRow?: Record<string, unknown>;
    dayPlanRow?: Record<string, unknown>;
    recipeRow?: Record<string, unknown> | null;
  },
) => {
  if (table === weekPlan) {
    return valuesByTable.weekPlanRow ?? null;
  }

  if (table === dayPlan) {
    return valuesByTable.dayPlanRow ?? null;
  }

  if (table === recipes) {
    return valuesByTable.recipeRow ?? null;
  }

  return null;
};

const pickSelection = (
  selection: Record<string, { table: unknown; name: string }>,
  valuesByTable: {
    weekPlanRow?: Record<string, unknown>;
    dayPlanRow?: Record<string, unknown>;
    recipeRow?: Record<string, unknown> | null;
  },
) => {
  const result: Record<string, unknown> = {};

  for (const [key, column] of Object.entries(selection)) {
    const selectedRow = getSelectedRow(column.table, valuesByTable);
    result[key] = selectedRow?.[toPropertyName(column.name)] ?? null;
  }

  return result;
};

const getTableName = (table: unknown) => {
  if (table === weekPlan) {
    return "week_plan";
  }

  if (table === dayPlan) {
    return "day_plan";
  }

  if (table === recipes) {
    return "recipes";
  }

  return "unknown";
};

const getReturningSelection = (
  selection: Record<string, { table: unknown; name: string }>,
  row: WeekPlanRow,
) => {
  return pickSelection(selection, {
    weekPlanRow: row as Record<string, unknown>,
  });
};

const createFakeDb = () => {
  let weekPlans: WeekPlanRow[] = [];
  let dayPlans: DayPlanRow[] = [];
  let recipes: RecipeRow[] = [];
  let nextWeekPlanId = 1;
  let nextDayPlanId = 1;

  const db = {
    reset: (state?: {
      weekPlans?: WeekPlanRow[];
      dayPlans?: DayPlanRow[];
      recipes?: RecipeRow[];
    }) => {
      weekPlans = [...(state?.weekPlans ?? [])];
      dayPlans = [...(state?.dayPlans ?? [])];
      recipes = [...(state?.recipes ?? [])];
      nextWeekPlanId =
        weekPlans.reduce((maxId, row) => Math.max(maxId, row.id), 0) + 1;
      nextDayPlanId =
        dayPlans.reduce((maxId, row) => Math.max(maxId, row.id), 0) + 1;
    },
    state: () => ({
      weekPlans: [...weekPlans],
      dayPlans: [...dayPlans],
      recipes: [...recipes],
    }),
    transaction: async (
      callback: (transaction: typeof db) => Promise<unknown>,
    ) => {
      return callback(db);
    },
    select: (selection: Record<string, { table: unknown; name: string }>) => ({
      from: (table: unknown) => {
        if (table === weekPlan) {
          return {
            where: async (condition: { queryChunks: unknown[] }) => {
              return weekPlans
                .filter((row) => evaluateCondition(row as Record<string, unknown>, condition))
                .map((row) =>
                  pickSelection(selection, {
                    weekPlanRow: row as Record<string, unknown>,
                  }),
                );
            },
          };
        }

        if (table === dayPlan) {
          return {
            leftJoin: () => ({
              where: (condition: { queryChunks: unknown[] }) => ({
                orderBy: async () => {
                  return dayPlans
                    .filter((row) =>
                      evaluateCondition(row as Record<string, unknown>, condition),
                    )
                    .sort((leftRow, rightRow) =>
                      leftRow.plannedDate.localeCompare(rightRow.plannedDate),
                    )
                    .map((row) => {
                      const recipe =
                        recipes.find((recipeRow) => recipeRow.id === row.recipeId) ?? null;

                      return pickSelection(selection, {
                        dayPlanRow: row as Record<string, unknown>,
                        recipeRow: recipe as Record<string, unknown> | null,
                      });
                    });
                },
              }),
            }),
          };
        }

        throw new Error(`Unsupported table selection: ${getTableName(table)}`);
      },
    }),
    insert: (table: unknown) => ({
      values: (
        input:
          | Record<string, unknown>
          | Array<Record<string, unknown>>,
      ) => {
        const values = Array.isArray(input) ? input : [input];

        if (table === weekPlan) {
          const insertedRows = values.map((value) => {
            const row: WeekPlanRow = {
              id: nextWeekPlanId,
              userId: Number(value.userId),
              weekStartDate: String(value.weekStartDate),
              status: (value.status as string | null | undefined) ?? null,
            };
            nextWeekPlanId += 1;
            weekPlans.push(row);
            return row;
          });

          return {
            returning: async (
              selection: Record<string, { table: unknown; name: string }>,
            ) => {
              return insertedRows.map((row) => getReturningSelection(selection, row));
            },
          };
        }

        if (table === dayPlan) {
          return {
            onConflictDoNothing: async () => {
              for (const value of values) {
                const existingRow = dayPlans.find(
                  (row) =>
                    row.weekPlanId === Number(value.weekPlanId) &&
                    row.plannedDate === String(value.plannedDate),
                );

                if (existingRow) {
                  continue;
                }

                dayPlans.push({
                  id: nextDayPlanId,
                  plannedDate: String(value.plannedDate),
                  recipeId:
                    value.recipeId === null || value.recipeId === undefined
                      ? null
                      : Number(value.recipeId),
                  weekPlanId: Number(value.weekPlanId),
                });
                nextDayPlanId += 1;
              }
            },
            onConflictDoUpdate: async () => {
              for (const value of values) {
                const existingRow = dayPlans.find(
                  (row) =>
                    row.weekPlanId === Number(value.weekPlanId) &&
                    row.plannedDate === String(value.plannedDate),
                );

                if (existingRow) {
                  existingRow.recipeId =
                    value.recipeId === null || value.recipeId === undefined
                      ? null
                      : Number(value.recipeId);
                  continue;
                }

                dayPlans.push({
                  id: nextDayPlanId,
                  plannedDate: String(value.plannedDate),
                  recipeId:
                    value.recipeId === null || value.recipeId === undefined
                      ? null
                      : Number(value.recipeId),
                  weekPlanId: Number(value.weekPlanId),
                });
                nextDayPlanId += 1;
              }
            },
          };
        }

        throw new Error(`Unsupported table insertion: ${getTableName(table)}`);
      },
    }),
  };

  return db;
};

const fakeDb = createFakeDb();
let getOrCreateWeekPlan: typeof import("./weekPlan-service.ts")["getOrCreateWeekPlan"];

describe("week plan service", () => {
  beforeAll(async () => {
    mock.restore();

    mock.module("../../db/drizzle/index", () => ({
      db: fakeDb,
    }));

    mock.module("./planning-date-utils", () => ({
      buildWeekDates: (weekStartDate: string) => {
        return [
          weekStartDate,
          "2026-04-07",
          "2026-04-08",
          "2026-04-09",
          "2026-04-10",
          "2026-04-11",
          "2026-04-12",
        ];
      },
    }));

    ({ getOrCreateWeekPlan } = await import("./weekPlan-service.ts"));
  });

  beforeEach(() => {
    fakeDb.reset();
  });

  afterAll(() => {
    mock.restore();
  });

  test("creates a missing week and seven empty days", async () => {
    const result = await getOrCreateWeekPlan({
      userId: 4,
      weekStartDate: "2026-04-06",
    });

    expect(result).toEqual({
      id: 1,
      weekStartDate: "2026-04-06",
      status: "PLANNED",
      days: [
        { id: 1, plannedDate: "2026-04-06", recipe: null },
        { id: 2, plannedDate: "2026-04-07", recipe: null },
        { id: 3, plannedDate: "2026-04-08", recipe: null },
        { id: 4, plannedDate: "2026-04-09", recipe: null },
        { id: 5, plannedDate: "2026-04-10", recipe: null },
        { id: 6, plannedDate: "2026-04-11", recipe: null },
        { id: 7, plannedDate: "2026-04-12", recipe: null },
      ],
    });

    expect(fakeDb.state()).toEqual({
      weekPlans: [
        {
          id: 1,
          userId: 4,
          weekStartDate: "2026-04-06",
          status: "PLANNED",
        },
      ],
      dayPlans: [
        { id: 1, plannedDate: "2026-04-06", recipeId: null, weekPlanId: 1 },
        { id: 2, plannedDate: "2026-04-07", recipeId: null, weekPlanId: 1 },
        { id: 3, plannedDate: "2026-04-08", recipeId: null, weekPlanId: 1 },
        { id: 4, plannedDate: "2026-04-09", recipeId: null, weekPlanId: 1 },
        { id: 5, plannedDate: "2026-04-10", recipeId: null, weekPlanId: 1 },
        { id: 6, plannedDate: "2026-04-11", recipeId: null, weekPlanId: 1 },
        { id: 7, plannedDate: "2026-04-12", recipeId: null, weekPlanId: 1 },
      ],
      recipes: [],
    });
  });

  test("backfills missing days without overwriting existing recipes", async () => {
    fakeDb.reset({
      weekPlans: [
        {
          id: 9,
          userId: 4,
          weekStartDate: "2026-04-06",
          status: "PLANNED",
        },
      ],
      dayPlans: [
        { id: 30, plannedDate: "2026-04-06", recipeId: 11, weekPlanId: 9 },
        { id: 31, plannedDate: "2026-04-08", recipeId: null, weekPlanId: 9 },
      ],
      recipes: [
        { id: 11, title: "Tomato Pasta", url: "https://example.com/pasta" },
      ],
    });

    const result = await getOrCreateWeekPlan({
      userId: 4,
      weekStartDate: "2026-04-06",
    });

    expect(result.days).toEqual([
      {
        id: 30,
        plannedDate: "2026-04-06",
        recipe: {
          id: 11,
          title: "Tomato Pasta",
          url: "https://example.com/pasta",
        },
      },
      { id: 32, plannedDate: "2026-04-07", recipe: null },
      { id: 31, plannedDate: "2026-04-08", recipe: null },
      { id: 33, plannedDate: "2026-04-09", recipe: null },
      { id: 34, plannedDate: "2026-04-10", recipe: null },
      { id: 35, plannedDate: "2026-04-11", recipe: null },
      { id: 36, plannedDate: "2026-04-12", recipe: null },
    ]);

    expect(
      [...fakeDb.state().dayPlans].sort((leftRow, rightRow) =>
        leftRow.plannedDate.localeCompare(rightRow.plannedDate),
      ),
    ).toEqual([
      { id: 30, plannedDate: "2026-04-06", recipeId: 11, weekPlanId: 9 },
      { id: 32, plannedDate: "2026-04-07", recipeId: null, weekPlanId: 9 },
      { id: 31, plannedDate: "2026-04-08", recipeId: null, weekPlanId: 9 },
      { id: 33, plannedDate: "2026-04-09", recipeId: null, weekPlanId: 9 },
      { id: 34, plannedDate: "2026-04-10", recipeId: null, weekPlanId: 9 },
      { id: 35, plannedDate: "2026-04-11", recipeId: null, weekPlanId: 9 },
      { id: 36, plannedDate: "2026-04-12", recipeId: null, weekPlanId: 9 },
    ]);
  });

  test("returns an already complete week unchanged", async () => {
    fakeDb.reset({
      weekPlans: [
        {
          id: 5,
          userId: 4,
          weekStartDate: "2026-04-06",
          status: "PLANNED",
        },
      ],
      dayPlans: [
        { id: 1, plannedDate: "2026-04-06", recipeId: null, weekPlanId: 5 },
        { id: 2, plannedDate: "2026-04-07", recipeId: null, weekPlanId: 5 },
        { id: 3, plannedDate: "2026-04-08", recipeId: null, weekPlanId: 5 },
        { id: 4, plannedDate: "2026-04-09", recipeId: null, weekPlanId: 5 },
        { id: 5, plannedDate: "2026-04-10", recipeId: null, weekPlanId: 5 },
        { id: 6, plannedDate: "2026-04-11", recipeId: null, weekPlanId: 5 },
        { id: 7, plannedDate: "2026-04-12", recipeId: null, weekPlanId: 5 },
      ],
    });

    const result = await getOrCreateWeekPlan({
      userId: 4,
      weekStartDate: "2026-04-06",
    });

    expect(result.days).toHaveLength(7);
    expect(fakeDb.state().dayPlans).toHaveLength(7);
  });
});

describe("planning router", () => {
  let getSavedWeekPlan: ReturnType<typeof mock>;
  let mockedGetOrCreateWeekPlan: ReturnType<typeof mock>;
  let app: Hono;

  beforeAll(async () => {
    mock.restore();

    getSavedWeekPlan = mock(async () => null);
    mockedGetOrCreateWeekPlan = mock(async () => null);

    mock.module("./weekPlan-service", () => ({
      getSavedWeekPlan,
      getOrCreateWeekPlan: mockedGetOrCreateWeekPlan,
      saveWeekPlan: mock(async () => null),
    }));

    mock.module("./dayPlan-service", () => ({
      getAllDayPlansForUser: mock(async () => []),
      getDayPlanOwnerId: mock(async () => 4),
      assignRecipeToDayPlan: mock(async () => null),
      deleteRecipeByDayPlanId: mock(async () => null),
    }));

    mock.module("./weekPlan-model", () => ({
      weekPlanRequestSchema: z.object({
        userId: z.coerce.number().int().positive(),
        weekStartDate: z.string(),
      }),
      weekPlanSaveSchema: z.object({
        userId: z.coerce.number().int().positive(),
        weekStartDate: z.string(),
        days: z.array(
          z.object({
            plannedDate: z.string(),
            recipeId: z.number().int().positive().nullable(),
          }),
        ),
      }),
    }));

    mock.module("./dayPlan-model", () => ({
      dayPlanInsertSchema: z.object({
        id: z.number().int().positive(),
        recipeId: z.number().int().positive().nullable(),
      }),
    }));

    mock.module("../../utils/require-auth", () => ({
      requireAuth: async (c: any, next: any) => {
        c.set("userId", 4);
        await next();
      },
    }));

    const { default: planningRouter } = await import("./planning-router");

    app = new Hono();
    app.route("/planning", planningRouter);
  });

  beforeEach(() => {
    getSavedWeekPlan.mockReset();
    mockedGetOrCreateWeekPlan.mockReset();
  });

  test("GET /planning/week returns 404 when the week has not been initialized", async () => {
    getSavedWeekPlan.mockResolvedValueOnce(null);

    const response = await app.request(
      "/planning/week?userId=4&weekStartDate=2026-04-06",
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: "Week plan not found",
    });
  });

  test("POST /planning/week returns a full seven-day week for a new request", async () => {
    mockedGetOrCreateWeekPlan.mockResolvedValueOnce({
      id: 1,
      weekStartDate: "2026-04-06",
      status: "PLANNED",
      days: [
        { id: 1, plannedDate: "2026-04-06", recipe: null },
        { id: 2, plannedDate: "2026-04-07", recipe: null },
        { id: 3, plannedDate: "2026-04-08", recipe: null },
        { id: 4, plannedDate: "2026-04-09", recipe: null },
        { id: 5, plannedDate: "2026-04-10", recipe: null },
        { id: 6, plannedDate: "2026-04-11", recipe: null },
        { id: 7, plannedDate: "2026-04-12", recipe: null },
      ],
    });

    const response = await app.request("/planning/week", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        userId: 4,
        weekStartDate: "2026-04-06",
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: 1,
      weekStartDate: "2026-04-06",
      status: "PLANNED",
      days: [
        { id: 1, plannedDate: "2026-04-06", recipe: null },
        { id: 2, plannedDate: "2026-04-07", recipe: null },
        { id: 3, plannedDate: "2026-04-08", recipe: null },
        { id: 4, plannedDate: "2026-04-09", recipe: null },
        { id: 5, plannedDate: "2026-04-10", recipe: null },
        { id: 6, plannedDate: "2026-04-11", recipe: null },
        { id: 7, plannedDate: "2026-04-12", recipe: null },
      ],
    });
  });
});
