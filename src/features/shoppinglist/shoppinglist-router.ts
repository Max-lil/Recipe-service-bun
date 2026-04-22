import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { shoppingListManualItemSchema } from "./shoppinglist-model";
import * as shoppingListService from "./shoppinglist-service";

const router = new Hono();

router.get("/:weekPlanId", async (c) => {
  const weekPlanId = Number(c.req.param("weekPlanId"));
  const shoppingList = await shoppingListService.getShoppingListByWeekPlanId(
    weekPlanId,
  );

  return c.json(shoppingList);
});

router.post(
  "/:weekPlanId",
  zValidator("json", shoppingListManualItemSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          message: "Invalid request body",
          errors: result.error,
        },
        400,
      );
    }
  }),
  async (c) => {
    const weekPlanId = Number(c.req.param("weekPlanId"));
    const shoppingListItem = await shoppingListService.addManualShoppingListItem(
      weekPlanId,
      c.req.valid("json"),
    );

    return c.json(shoppingListItem, 200);
  },
);

export default router;
