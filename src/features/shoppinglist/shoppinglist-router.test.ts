import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";

describe("shopping list router", () => {
  let addManualShoppingListItem: ReturnType<typeof mock>;
  let app: Hono;

  beforeAll(async () => {
    mock.restore();

    addManualShoppingListItem = mock(async () => ({
      id: 1,
      checked: false,
      name: "Milk",
      quantity: 2,
      unit: "dl",
      weekPlanId: 7,
    }));

    mock.module("./shoppinglist-service", () => ({
      getShoppingListByWeekPlanId: mock(async () => []),
      addManualShoppingListItem,
    }));

    const { default: shoppingListRouter } = await import("./shoppinglist-router");

    app = new Hono();
    app.route("/shoppinglist", shoppingListRouter);
  });

  beforeEach(() => {
    addManualShoppingListItem.mockReset();
    addManualShoppingListItem.mockResolvedValue({
      id: 1,
      checked: false,
      name: "Milk",
      quantity: 2,
      unit: "dl",
      weekPlanId: 7,
    });
  });

  test("POST /shoppinglist/:weekPlanId returns 400 for an invalid body", async () => {
    const response = await app.request("/shoppinglist/7", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "   ",
        quantity: 2,
        unit: "dl",
      }),
    });

    expect(response.status).toBe(400);
    expect(addManualShoppingListItem).not.toHaveBeenCalled();
  });

  test("POST /shoppinglist/:weekPlanId returns the updated row", async () => {
    const response = await app.request("/shoppinglist/7", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Milk",
        quantity: 2,
        unit: "dl",
      }),
    });

    expect(response.status).toBe(200);
    expect(addManualShoppingListItem).toHaveBeenCalledWith(7, {
      name: "Milk",
      quantity: 2,
      unit: "dl",
    });
    await expect(response.json()).resolves.toEqual({
      id: 1,
      checked: false,
      name: "Milk",
      quantity: 2,
      unit: "dl",
      weekPlanId: 7,
    });
  });
});
