import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  dayPlan,
  ingredient,
  shoppingListItem,
} from "../../db/drizzle/schema";

type ShoppingListRow = {
  id: number;
  checked: boolean;
  name: string;
  quantity: number;
  manualQuantity: number;
  unit: string;
  weekPlanId: number;
};

type DayPlanRow = {
  id: number;
  recipeId: number | null;
  weekPlanId: number;
};

type IngredientRow = {
  id: number;
  recipeId: number;
  name: string;
  quantity: number | null;
  unit: string;
};

const getConditionValue = (condition: { queryChunks: unknown[] }) => {
  const parameter = condition.queryChunks.find((chunk) => {
    return (
      typeof chunk === "object" &&
      chunk !== null &&
      "value" in chunk &&
      "encoder" in chunk
    );
  }) as { value: unknown } | undefined;

  return parameter?.value;
};

const createFakeDb = () => {
  let shoppingListRows: ShoppingListRow[] = [];
  let dayPlanRows: DayPlanRow[] = [];
  let ingredientRows: IngredientRow[] = [];
  let nextShoppingListId = 1;

  return {
    reset: (state?: {
      shoppingListRows?: ShoppingListRow[];
      dayPlanRows?: DayPlanRow[];
      ingredientRows?: IngredientRow[];
    }) => {
      shoppingListRows = [...(state?.shoppingListRows ?? [])];
      dayPlanRows = [...(state?.dayPlanRows ?? [])];
      ingredientRows = [...(state?.ingredientRows ?? [])];
      nextShoppingListId =
        shoppingListRows.reduce((maxId, row) => Math.max(maxId, row.id), 0) + 1;
    },
    state: () => ({
      shoppingListRows: [...shoppingListRows],
      dayPlanRows: [...dayPlanRows],
      ingredientRows: [...ingredientRows],
    }),
    select: (
      selection?: Record<string, { table: unknown; name: string }>,
    ) => ({
      from: (table: unknown) => {
        if (table === shoppingListItem) {
          return {
            where: (condition: { queryChunks: unknown[] }) => ({
              orderBy: async () => {
                const weekPlanId = Number(getConditionValue(condition));

                return shoppingListRows
                  .filter((row) => row.weekPlanId === weekPlanId)
                  .sort((leftRow, rightRow) =>
                    leftRow.name.localeCompare(rightRow.name),
                  )
                  .map((row) => ({ ...row }));
              },
            }),
          };
        }

        if (table === dayPlan) {
          return {
            innerJoin: (joinedTable: unknown) => {
              if (joinedTable !== ingredient) {
                throw new Error("Unsupported join");
              }

              return {
                where: (condition: { queryChunks: unknown[] }) => ({
                  orderBy: async () => {
                    const weekPlanId = Number(getConditionValue(condition));
                    const joinedRows = dayPlanRows
                      .filter((row) => row.weekPlanId === weekPlanId)
                      .flatMap((row) => {
                        if (row.recipeId === null) {
                          return [];
                        }

                        return ingredientRows
                          .filter((ingredientRow) => {
                            return ingredientRow.recipeId === row.recipeId;
                          })
                          .map((ingredientRow) => {
                            if (!selection) {
                              return ingredientRow;
                            }

                            return {
                              name: ingredientRow.name,
                              quantity: ingredientRow.quantity,
                              unit: ingredientRow.unit,
                            };
                          });
                      });

                    joinedRows.sort((leftRow, rightRow) =>
                      leftRow.name.localeCompare(rightRow.name),
                    );

                    return joinedRows;
                  },
                }),
              };
            },
          };
        }

        throw new Error("Unsupported table selection");
      },
    }),
    insert: (table: unknown) => ({
      values: (input: Record<string, unknown> | Array<Record<string, unknown>>) => {
        const values = Array.isArray(input) ? input : [input];

        if (table !== shoppingListItem) {
          throw new Error("Unsupported table insertion");
        }

        const insertedRows = values.map((value) => {
          const row: ShoppingListRow = {
            id: nextShoppingListId,
            checked: Boolean(value.checked),
            name: String(value.name),
            quantity: Number(value.quantity),
            manualQuantity: Number(value.manualQuantity ?? 0),
            unit: String(value.unit),
            weekPlanId: Number(value.weekPlanId),
          };

          nextShoppingListId += 1;
          shoppingListRows.push(row);
          return row;
        });

        return {
          returning: async () => insertedRows.map((row) => ({ ...row })),
        };
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: (condition: { queryChunks: unknown[] }) => ({
          returning: async () => {
            if (table !== shoppingListItem) {
              throw new Error("Unsupported table update");
            }

            const id = Number(getConditionValue(condition));
            const row = shoppingListRows.find((shoppingListRow) => {
              return shoppingListRow.id === id;
            });

            if (!row) {
              return [];
            }

            row.quantity = Number(values.quantity);
            row.manualQuantity = Number(values.manualQuantity);

            return [{ ...row }];
          },
        }),
      }),
    }),
    delete: (table: unknown) => ({
      where: async (condition: { queryChunks: unknown[] }) => {
        if (table !== shoppingListItem) {
          throw new Error("Unsupported table delete");
        }

        const weekPlanId = Number(getConditionValue(condition));
        shoppingListRows = shoppingListRows.filter((row) => {
          return row.weekPlanId !== weekPlanId;
        });
      },
    }),
  };
};

const fakeDb = createFakeDb();
let addManualShoppingListItem: typeof import("./shoppinglist-service")["addManualShoppingListItem"];
let buildShoppingListItemsForWeekPlan: typeof import("./shoppinglist-service")["buildShoppingListItemsForWeekPlan"];
let buildSyncedShoppingListItemsForWeekPlan: typeof import("./shoppinglist-service")["buildSyncedShoppingListItemsForWeekPlan"];
let syncShoppingListForWeekPlan: typeof import("./shoppinglist-service")["syncShoppingListForWeekPlan"];

describe("shopping list service", () => {
  beforeAll(async () => {
    mock.restore();
    ({
      addManualShoppingListItem,
      buildShoppingListItemsForWeekPlan,
      buildSyncedShoppingListItemsForWeekPlan,
      syncShoppingListForWeekPlan,
    } = await import("./shoppinglist-service"));
  });

  beforeEach(() => {
    fakeDb.reset();
  });

  test("creates shopping list rows for a week", () => {
    const result = buildShoppingListItemsForWeekPlan(12, [
      { name: "Milk", quantity: 2, unit: "dl" },
      { name: "Salt", quantity: null, unit: "pcs" },
    ]);

    expect(result).toEqual([
      {
        checked: false,
        name: "Milk",
        quantity: 2,
        manualQuantity: 0,
        unit: "dl",
        weekPlanId: 12,
      },
      {
        checked: false,
        name: "Salt",
        quantity: 0,
        manualQuantity: 0,
        unit: "pcs",
        weekPlanId: 12,
      },
    ]);
  });

  test("merges matching ingredients and sums quantities", () => {
    const result = buildShoppingListItemsForWeekPlan(7, [
      { name: " Milk ", quantity: 2, unit: "dl" },
      { name: "milk", quantity: 1.5, unit: " dl " },
      { name: "Sugar", quantity: 3, unit: "msk" },
    ]);

    expect(result).toEqual([
      {
        checked: false,
        name: "Milk",
        quantity: 3.5,
        manualQuantity: 0,
        unit: "dl",
        weekPlanId: 7,
      },
      {
        checked: false,
        name: "Sugar",
        quantity: 3,
        manualQuantity: 0,
        unit: "msk",
        weekPlanId: 7,
      },
    ]);
  });

  test("returns ingredients in alphabetical order", () => {
    const result = buildShoppingListItemsForWeekPlan(9, [
      { name: "Sugar", quantity: 3, unit: "msk" },
      { name: "apple", quantity: 2, unit: "pcs" },
      { name: "Butter", quantity: 50, unit: "g" },
    ]);

    expect(result).toEqual([
      {
        checked: false,
        name: "apple",
        quantity: 2,
        manualQuantity: 0,
        unit: "pcs",
        weekPlanId: 9,
      },
      {
        checked: false,
        name: "Butter",
        quantity: 50,
        manualQuantity: 0,
        unit: "g",
        weekPlanId: 9,
      },
      {
        checked: false,
        name: "Sugar",
        quantity: 3,
        manualQuantity: 0,
        unit: "msk",
        weekPlanId: 9,
      },
    ]);
  });

  test("adds a manual item for an empty week", async () => {
    const result = await addManualShoppingListItem(
      12,
      {
        name: " Milk ",
        quantity: 2,
        unit: " dl ",
      },
      fakeDb as typeof import("../../db/drizzle/index").db,
    );

    expect(result).toEqual({
      id: 1,
      checked: false,
      name: "Milk",
      quantity: 2,
      unit: "dl",
      weekPlanId: 12,
    });

    expect(fakeDb.state().shoppingListRows).toEqual([
      {
        id: 1,
        checked: false,
        name: "Milk",
        quantity: 2,
        manualQuantity: 2,
        unit: "dl",
        weekPlanId: 12,
      },
    ]);
  });

  test("merges a manual item into an existing matching row", async () => {
    fakeDb.reset({
      shoppingListRows: [
        {
          id: 1,
          checked: false,
          name: "Milk",
          quantity: 2,
          manualQuantity: 0.5,
          unit: "dl",
          weekPlanId: 7,
        },
      ],
    });

    const result = await addManualShoppingListItem(
      7,
      {
        name: " milk ",
        quantity: 1.5,
        unit: " dl ",
      },
      fakeDb as typeof import("../../db/drizzle/index").db,
    );

    expect(result).toEqual({
      id: 1,
      checked: false,
      name: "Milk",
      quantity: 3.5,
      unit: "dl",
      weekPlanId: 7,
    });

    expect(fakeDb.state().shoppingListRows).toEqual([
      {
        id: 1,
        checked: false,
        name: "Milk",
        quantity: 3.5,
        manualQuantity: 2,
        unit: "dl",
        weekPlanId: 7,
      },
    ]);
  });

  test("stores null manual quantity as zero and returns null", async () => {
    const result = await addManualShoppingListItem(
      5,
      {
        name: "Salt",
        quantity: null,
        unit: "pcs",
      },
      fakeDb as typeof import("../../db/drizzle/index").db,
    );

    expect(result).toEqual({
      id: 1,
      checked: false,
      name: "Salt",
      quantity: null,
      unit: "pcs",
      weekPlanId: 5,
    });

    expect(fakeDb.state().shoppingListRows[0]).toEqual({
      id: 1,
      checked: false,
      name: "Salt",
      quantity: 0,
      manualQuantity: 0,
      unit: "pcs",
      weekPlanId: 5,
    });
  });

  test("keeps manual quantities when syncing recipe and manual rows", () => {
    const result = buildSyncedShoppingListItemsForWeekPlan(
      3,
      [{ name: "Milk", quantity: 2, unit: "dl" }],
      [{ name: " milk ", unit: " dl ", manualQuantity: 1.5 }],
    );

    expect(result).toEqual([
      {
        checked: false,
        name: "Milk",
        quantity: 3.5,
        manualQuantity: 1.5,
        unit: "dl",
        weekPlanId: 3,
      },
    ]);
  });

  test("keeps manual-only items when syncing an empty recipe week", () => {
    const result = buildSyncedShoppingListItemsForWeekPlan(
      5,
      [],
      [{ name: " Butter ", unit: " g ", manualQuantity: 50 }],
    );

    expect(result).toEqual([
      {
        checked: false,
        name: "Butter",
        quantity: 50,
        manualQuantity: 50,
        unit: "g",
        weekPlanId: 5,
      },
    ]);
  });

  test("sync preserves manual quantity when recipe quantity changes", async () => {
    fakeDb.reset({
      shoppingListRows: [
        {
          id: 1,
          checked: false,
          name: "Milk",
          quantity: 3,
          manualQuantity: 1,
          unit: "dl",
          weekPlanId: 8,
        },
      ],
      dayPlanRows: [
        {
          id: 1,
          recipeId: 41,
          weekPlanId: 8,
        },
      ],
      ingredientRows: [
        {
          id: 1,
          recipeId: 41,
          name: "Milk",
          quantity: 4,
          unit: "dl",
        },
      ],
    });

    await syncShoppingListForWeekPlan(
      8,
      fakeDb as typeof import("../../db/drizzle/index").db,
    );

    expect(fakeDb.state().shoppingListRows).toEqual([
      {
        id: 2,
        checked: false,
        name: "Milk",
        quantity: 5,
        manualQuantity: 1,
        unit: "dl",
        weekPlanId: 8,
      },
    ]);
  });
});
