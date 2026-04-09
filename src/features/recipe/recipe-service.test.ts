import { afterEach, describe, expect, mock, test } from "bun:test";
import { recipeCreateSchema } from "./recipe-model";

let expectedValues: { title: string; url: string | null } | null = null;

const returning = mock((selection: unknown) => {
  expect(selection).toBeDefined();
  expect(expectedValues).not.toBeNull();

  return Promise.resolve([
    {
      id: 1,
      title: expectedValues!.title,
      url: expectedValues!.url,
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
  syncShoppingListForWeekPlan: mock(async () => undefined),
}));

const { createRecipe } = await import("./recipe-service");

describe("recipe service", () => {
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
