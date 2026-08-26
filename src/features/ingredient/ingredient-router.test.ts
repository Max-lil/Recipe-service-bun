import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";

describe("ingredient router", () => {
  let realRecipeServiceExports: typeof import("../recipe/recipe-service");
  let getRecipeOwnerId: ReturnType<typeof mock>;
  let getAllIngredientsByRecipeId: ReturnType<typeof mock>;
  let app: Hono;

  beforeAll(async () => {
    mock.restore();

    // "../recipe/recipe-service" resolves to the same module as
    // "./recipe-service" in the recipe feature's own tests, and
    // mock.module overwrites that module's exports in place for the rest
    // of the test run. Snapshot the real exports into a plain object
    // (not just a reference to the live module) before mocking, so
    // afterAll can restore the true implementation for later test files.
    const realRecipeService = await import("../recipe/recipe-service");
    realRecipeServiceExports = { ...realRecipeService };

    getRecipeOwnerId = mock(async () => 4);
    getAllIngredientsByRecipeId = mock(async () => [
      { id: 1, name: "Tomato", quantity: 2, unit: "st", recipeId: 5, rawText: "2 st tomat" },
    ]);

    mock.module("./ingredient-service", () => ({
      getAllIngredientsByRecipeId,
    }));

    mock.module("../recipe/recipe-service", () => ({
      ...realRecipeServiceExports,
      getRecipeOwnerId,
    }));

    mock.module("../../utils/require-auth", () => ({
      requireAuth: async (c: any, next: any) => {
        c.set("userId", 4);
        await next();
      },
    }));

    const { default: ingredientRouter } = await import("./ingredient-router");

    app = new Hono();
    app.route("/ingredients", ingredientRouter);
  });

  afterAll(() => {
    mock.module("../recipe/recipe-service", () => realRecipeServiceExports);
  });

  beforeEach(() => {
    getRecipeOwnerId.mockReset();
    getRecipeOwnerId.mockResolvedValue(4);
    getAllIngredientsByRecipeId.mockClear();
  });

  test("returns 404 when the recipe doesn't exist", async () => {
    getRecipeOwnerId.mockResolvedValue(null);

    const response = await app.request("/ingredients/5");

    expect(response.status).toBe(404);
    expect(getAllIngredientsByRecipeId).not.toHaveBeenCalled();
  });

  test("returns 403 when the recipe belongs to another user", async () => {
    getRecipeOwnerId.mockResolvedValue(9);

    const response = await app.request("/ingredients/5");

    expect(response.status).toBe(403);
    expect(getAllIngredientsByRecipeId).not.toHaveBeenCalled();
  });

  test("returns the ingredients when the recipe belongs to the session user", async () => {
    const response = await app.request("/ingredients/5");

    expect(response.status).toBe(200);
    expect(getAllIngredientsByRecipeId).toHaveBeenCalledWith(5);
    await expect(response.json()).resolves.toEqual([
      { id: 1, name: "Tomato", quantity: 2, unit: "st", recipeId: 5, rawText: "2 st tomat" },
    ]);
  });
});
