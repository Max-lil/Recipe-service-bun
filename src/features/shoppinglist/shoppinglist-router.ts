import { app } from "../ingredient/ingredient-router";
import * as service from "./shoppinglist-service";

app.get("/shoppinglist/:weekPlanId", async (c) => {
  const weekPlanId = c.req.param("weekPlanId");
  const response = await service.getShoppinglistByWeekPlanId(
    Number(weekPlanId),
  );

  return c.json(response);
});
