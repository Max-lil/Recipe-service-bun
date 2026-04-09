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

let expectedValues: { title: string; url: string | null } | null = null;
let createRecipe: typeof import("./recipe-service")["createRecipe"];

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

describe("recipe service", () => {
  beforeAll(async () => {
    const shoppingListService = await import(
      "../shoppinglist/shoppinglist-service"
    );

    mock.module("../../db/drizzle/index", () => ({
      db: {
        insert,
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

    ({ createRecipe } = await import("./recipe-service"));
  });

  afterAll(() => {
    mock.restore();
  });

  afterEach(() => {
    expectedValues = null;
    insert.mockClear();
    values.mockClear();
    returning.mockClear();
  });

  test("persists null when url is omitted", async () => {
    const payload = recipeCreateSchema.parse({
      title: "Tomato Soup",
    });

    expectedValues = { title: "Tomato Soup", url: null };

    await expect(createRecipe(payload)).resolves.toEqual({
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

    expectedValues = { title: "Tomato Soup", url: null };

    await expect(createRecipe(payload)).resolves.toEqual({
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

    expectedValues = { title: "Tomato Soup", url: null };

    await expect(createRecipe(payload)).resolves.toEqual({
      id: 1,
      title: "Tomato Soup",
      url: null,
      ingredientsRaw: null,
    });
  });
});
