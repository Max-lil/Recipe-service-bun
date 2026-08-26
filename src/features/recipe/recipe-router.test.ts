import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";

describe("recipe router", () => {
  let realRecipeServiceExports: typeof import("./recipe-service");
  let getAllRecipes: ReturnType<typeof mock>;
  let createRecipe: ReturnType<typeof mock>;
  let scrapeAndSaveRecipe: ReturnType<typeof mock>;
  let app: Hono;

  beforeAll(async () => {
    mock.restore();

    // "./recipe-service" and "../recipe/recipe-service" (from
    // ingredient-router.test.ts) resolve to the same module, and
    // mock.module overwrites that module's exports in place for the rest
    // of the test run. Snapshot the real exports into a plain object
    // (not just a reference to the live module) before mocking, so
    // afterAll can restore the true implementation for later test files
    // (e.g. recipe-service.test.ts).
    const realRecipeService = await import("./recipe-service");
    realRecipeServiceExports = { ...realRecipeService };

    getAllRecipes = mock(async () => []);
    createRecipe = mock(async () => ({
      id: 1,
      title: "Tomato Soup",
      url: null,
      ingredientsRaw: null,
    }));
    scrapeAndSaveRecipe = mock(async () => ({
      recipe: { id: 1, title: "Tomato Soup", url: "https://example.com", ingredientsRaw: null },
      ingredients: [],
    }));

    mock.module("./recipe-service", () => ({
      ...realRecipeServiceExports,
      getAllRecipes,
      createRecipe,
      scrapeAndSaveRecipe,
    }));

    mock.module("../../utils/require-auth", () => ({
      requireAuth: async (c: any, next: any) => {
        c.set("userId", 4);
        await next();
      },
    }));

    const { default: recipeRouter } = await import("./recipe-router");

    app = new Hono();
    app.route("/recipes", recipeRouter);
  });

  afterAll(() => {
    mock.module("./recipe-service", () => realRecipeServiceExports);
  });

  beforeEach(() => {
    getAllRecipes.mockClear();
    createRecipe.mockClear();
    scrapeAndSaveRecipe.mockClear();
  });

  test("GET /recipes scopes to the session's userId", async () => {
    const response = await app.request("/recipes");

    expect(response.status).toBe(200);
    expect(getAllRecipes).toHaveBeenCalledWith(4);
  });

  test("POST /recipes stamps the session's userId", async () => {
    const response = await app.request("/recipes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Tomato Soup" }),
    });

    expect(response.status).toBe(201);
    expect(createRecipe).toHaveBeenCalledWith({ title: "Tomato Soup", url: null }, 4);
  });

  test("POST /recipes/add stamps the session's userId", async () => {
    const response = await app.request("/recipes/add", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Tomato Soup" }),
    });

    expect(response.status).toBe(201);
    expect(createRecipe).toHaveBeenCalledWith({ title: "Tomato Soup", url: null }, 4);
  });

  test("POST /recipes/scrape stamps the session's userId", async () => {
    const response = await app.request("/recipes/scrape", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com" }),
    });

    expect(response.status).toBe(200);
    expect(scrapeAndSaveRecipe).toHaveBeenCalledWith(
      { url: "https://example.com" },
      4,
    );
  });
});
