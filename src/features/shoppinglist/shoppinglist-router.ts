import { Hono } from "hono";
import * as service from "./shoppinglist-service";

export const app = new Hono();

app.get("/:weekPlanId", async (c) => {
  const weekPlanId = c.req.param("weekPlanId");
  const response = await service.getShoppinglistByWeekPlanId(
    Number(weekPlanId),
  );

  return c.json(response);
});

export default app;
