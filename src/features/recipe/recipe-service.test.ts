import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { recipeCreateSchema } from "./recipe-model";

let expectedValues: { title: string; url: string | null; userId: number } | null =
  null;
let createRecipe: typeof import("./recipe-service")["createRecipe"];
let getRecipeOwnerId: typeof import("./recipe-service")["getRecipeOwnerId"];

const getExpectedValues = () => {
  if (!expectedValues) {
    throw new Error("Expected test values were not set");
  }

  return expectedValues;
};

const returning = mock((selection: unknown) => {
  expect(selection).toBeDefined();
  const currentExpectedValues = getExpectedValues();

  return Promise.resolve([
    {
      id: 1,
      title: currentExpectedValues.title,
      url: currentExpectedValues.url,
      ingredientsRaw: null,
    },
  ]);
});

const values = mock((value: unknown) => {
  expect(value).toEqual(expectedValues);
  return { returning };
});

const insert = mock((table: unknown) => {
  expect(table).toBeDefined();
  return { values };
});

let ownerRows: { userId: number }[] = [];

const ownerWhere = mock((condition: unknown) => {
  expect(condition).toBeDefined();
  return Promise.resolve(ownerRows);
});

const ownerFrom = mock((table: unknown) => {
  expect(table).toBeDefined();
  return { where: ownerWhere };
});

const select = mock((selection: unknown) => {
  expect(selection).toBeDefined();
  return { from: ownerFrom };
});

describe("recipe service", () => {
  beforeAll(async () => {
    const shoppingListService = await import(
      "../shoppinglist/shoppinglist-service"
    );

    mock.module("../../db/drizzle/index", () => ({
      db: {
        insert,
        select,
      },
    }));

    mock.module("./recipe-scraper", () => ({
      scrapeRecipeFromUrl: mock(),
      RecipeScrapeError: class RecipeScrapeError extends Error {
        status: number;

        constructor(status: number, message: string) {
          super(message);
          this.status = status;
        }
      },
    }));

    mock.module("../shoppinglist/shoppinglist-service", () => ({
      ...shoppingListService,
      syncShoppingListForWeekPlan: mock(async () => undefined),
    }));

    ({ createRecipe, getRecipeOwnerId } = await import("./recipe-service"));
  });

  afterAll(() => {
    mock.restore();
  });

  afterEach(() => {
    expectedValues = null;
    ownerRows = [];
    insert.mockClear();
    values.mockClear();
    returning.mockClear();
    select.mockClear();
    ownerFrom.mockClear();
    ownerWhere.mockClear();
  });

  test("persists null when url is omitted", async () => {
    const payload = recipeCreateSchema.parse({
      title: "Tomato Soup",
    });

    expectedValues = { title: "Tomato Soup", url: null, userId: 4 };

    await expect(createRecipe(payload, 4)).resolves.toEqual({
      id: 1,
      title: "Tomato Soup",
      url: null,
      ingredientsRaw: null,
    });
  });

  test("persists null when url is explicitly null", async () => {
    const payload = recipeCreateSchema.parse({
      title: "Tomato Soup",
      url: null,
    });

    expectedValues = { title: "Tomato Soup", url: null, userId: 4 };

    await expect(createRecipe(payload, 4)).resolves.toEqual({
      id: 1,
      title: "Tomato Soup",
      url: null,
      ingredientsRaw: null,
    });
  });

  test("persists null when url is blank", async () => {
    const payload = recipeCreateSchema.parse({
      title: "Tomato Soup",
      url: "   ",
    });

    expectedValues = { title: "Tomato Soup", url: null, userId: 4 };

    await expect(createRecipe(payload, 4)).resolves.toEqual({
      id: 1,
      title: "Tomato Soup",
      url: null,
      ingredientsRaw: null,
    });
  });

  test("getRecipeOwnerId returns the owning user's id", async () => {
    ownerRows = [{ userId: 4 }];

    await expect(getRecipeOwnerId(7)).resolves.toBe(4);
  });

  test("getRecipeOwnerId returns null when the recipe doesn't exist", async () => {
    ownerRows = [];

    await expect(getRecipeOwnerId(7)).resolves.toBeNull();
  });
});
