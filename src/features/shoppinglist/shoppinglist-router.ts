import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { shoppingListManualItemSchema } from "./shoppinglist-model";
import * as shoppingListService from "./shoppinglist-service";
import { requireAuth, type AuthVariables } from "../../utils/require-auth";

const router = new Hono<{ Variables: AuthVariables }>();

router.use("*", requireAuth);

router.get("/:weekPlanId", async (c) => {
  const weekPlanId = Number(c.req.param("weekPlanId"));
  const ownerId = await shoppingListService.getWeekPlanOwnerId(weekPlanId);

  if (ownerId === null) {
    return c.json({ message: "Week plan not found" }, 404);
  }
  if (ownerId !== c.get("userId")) {
    return c.json({ message: "Forbidden" }, 403);
  }

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
    const ownerId = await shoppingListService.getWeekPlanOwnerId(weekPlanId);

    if (ownerId === null) {
      return c.json({ message: "Week plan not found" }, 404);
    }
    if (ownerId !== c.get("userId")) {
      return c.json({ message: "Forbidden" }, 403);
    }

    const shoppingListItem = await shoppingListService.addManualShoppingListItem(
      weekPlanId,
      c.req.valid("json"),
    );

    return c.json(shoppingListItem, 200);
  },
);

export default router;
