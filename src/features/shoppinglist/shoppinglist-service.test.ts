import { beforeAll, describe, expect, mock, test } from "bun:test";

let buildShoppingListItemsForWeekPlan: typeof import("./shoppinglist-service")["buildShoppingListItemsForWeekPlan"];

describe("shopping list sync", () => {
  beforeAll(async () => {
    mock.restore();
    ({ buildShoppingListItemsForWeekPlan } = await import("./shoppinglist-service"));
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
        unit: "dl",
        weekPlanId: 12,
      },
      {
        checked: false,
        name: "Salt",
        quantity: 0,
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
        unit: "dl",
        weekPlanId: 7,
      },
      {
        checked: false,
        name: "Sugar",
        quantity: 3,
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
        unit: "pcs",
        weekPlanId: 9,
      },
      {
        checked: false,
        name: "Butter",
        quantity: 50,
        unit: "g",
        weekPlanId: 9,
      },
      {
        checked: false,
        name: "Sugar",
        quantity: 3,
        unit: "msk",
        weekPlanId: 9,
      },
    ]);
  });

  test("rebuilt rows reflect recipe replacement", () => {
    const beforeReplacement = buildShoppingListItemsForWeekPlan(3, [
      { name: "Milk", quantity: 2, unit: "dl" },
      { name: "Salt", quantity: 1, unit: "tsk" },
    ]);
    const afterReplacement = buildShoppingListItemsForWeekPlan(3, [
      { name: "Butter", quantity: 50, unit: "g" },
    ]);

    expect(beforeReplacement).toEqual([
      {
        checked: false,
        name: "Milk",
        quantity: 2,
        unit: "dl",
        weekPlanId: 3,
      },
      {
        checked: false,
        name: "Salt",
        quantity: 1,
        unit: "tsk",
        weekPlanId: 3,
      },
    ]);
    expect(afterReplacement).toEqual([
      {
        checked: false,
        name: "Butter",
        quantity: 50,
        unit: "g",
        weekPlanId: 3,
      },
    ]);
  });

  test("returns an empty list when all recipes are removed", () => {
    const result = buildShoppingListItemsForWeekPlan(5, []);

    expect(result).toEqual([]);
  });

  test("builds rows for the matching week id every time", () => {
    const weekOneRows = buildShoppingListItemsForWeekPlan(21, [
      { name: "Milk", quantity: 2, unit: "dl" },
    ]);
    const weekTwoRows = buildShoppingListItemsForWeekPlan(22, [
      { name: "Milk", quantity: 2, unit: "dl" },
    ]);

    expect(weekOneRows[0]).toEqual({
      checked: false,
      name: "Milk",
      quantity: 2,
      unit: "dl",
      weekPlanId: 21,
    });
    expect(weekTwoRows[0]).toEqual({
      checked: false,
      name: "Milk",
      quantity: 2,
      unit: "dl",
      weekPlanId: 22,
    });
  });
});
