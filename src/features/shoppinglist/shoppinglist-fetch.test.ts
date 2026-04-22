import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { shoppingListItem } from "../../db/drizzle/schema";

type ShoppingListRow = {
  id: number;
  checked: boolean;
  name: string;
  quantity: number;
  manualQuantity: number;
  unit: string;
  weekPlanId: number;
};

const toPropertyName = (columnName: string) => {
  return columnName.replace(/_([a-z])/g, (_, character: string) =>
    character.toUpperCase(),
  );
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

  return {
    reset: (rows: ShoppingListRow[] = []) => {
      shoppingListRows = [...rows];
    },
    select: () => ({
      from: (table: unknown) => {
        if (table !== shoppingListItem) {
          throw new Error("Unsupported table selection");
        }

        return {
          where: (condition: { queryChunks: unknown[] }) => ({
            orderBy: async () => {
              const weekPlanId = Number(getConditionValue(condition));

              return shoppingListRows
                .filter((row) => row.weekPlanId === weekPlanId)
                .sort((leftRow, rightRow) =>
                  leftRow.name.localeCompare(rightRow.name),
                )
                .map((row) => ({
                  ...row,
                  weekPlanId: row[toPropertyName("week_plan_id") as "weekPlanId"],
                }));
            },
          }),
        };
      },
    }),
  };
};

const fakeDb = createFakeDb();
let getShoppingListByWeekPlanId: typeof import("./shoppinglist-service")["getShoppingListByWeekPlanId"];

describe("shopping list fetch", () => {
  beforeAll(async () => {
    mock.restore();

    mock.module("../../db/drizzle/index", () => ({
      db: fakeDb,
    }));

    ({ getShoppingListByWeekPlanId } = await import("./shoppinglist-service"));
  });

  beforeEach(() => {
    fakeDb.reset();
  });

  afterAll(() => {
    mock.restore();
  });

  test("returns ingredient names in alphabetical order", async () => {
    fakeDb.reset([
      {
        id: 1,
        checked: false,
        name: "Sugar",
        quantity: 3,
        manualQuantity: 0,
        unit: "msk",
        weekPlanId: 5,
      },
      {
        id: 2,
        checked: false,
        name: "Apple",
        quantity: 0,
        manualQuantity: 0,
        unit: "pcs",
        weekPlanId: 5,
      },
      {
        id: 3,
        checked: false,
        name: "Butter",
        quantity: 50,
        manualQuantity: 2,
        unit: "g",
        weekPlanId: 5,
      },
      {
        id: 4,
        checked: false,
        name: "Milk",
        quantity: 2,
        manualQuantity: 0,
        unit: "dl",
        weekPlanId: 9,
      },
    ]);

    const result = await getShoppingListByWeekPlanId(5);

    expect(result).toEqual([
      {
        id: 2,
        checked: false,
        name: "Apple",
        quantity: null,
        unit: "pcs",
        weekPlanId: 5,
      },
      {
        id: 3,
        checked: false,
        name: "Butter",
        quantity: 50,
        unit: "g",
        weekPlanId: 5,
      },
      {
        id: 1,
        checked: false,
        name: "Sugar",
        quantity: 3,
        unit: "msk",
        weekPlanId: 5,
      },
    ]);
  });
});
