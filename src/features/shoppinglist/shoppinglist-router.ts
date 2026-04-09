import { Hono } from "hono";
import * as shoppingListService from "./shoppinglist-service";

const router = new Hono();

router.get("/:weekPlanId", async (c) => {
  const weekPlanId = Number(c.req.param("weekPlanId"));
  const shoppingList = await shoppingListService.getShoppingListByWeekPlanId(
    weekPlanId,
  );

  return c.json(shoppingList);
});

export default router;
