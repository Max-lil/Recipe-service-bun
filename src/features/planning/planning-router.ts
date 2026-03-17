import { Hono } from "hono";
import * as dayPlanservice from "./dayPlan-service";
import * as weekPlanservice from "./weekPlan-service";
import { zValidator } from "@hono/zod-validator";
import { weekPlanCreateSchema, weekPlanRequestSchema } from "./weekPlan-model";
import { dayPlanInsertSchema } from "./dayPlan-model";

const app = new Hono();

app.get("/days", async (c) => {
  const dayPlans = await dayPlanservice.getAllDayPlans();
  return c.json(dayPlans, 200);
});

app.post("/week", zValidator("json", weekPlanCreateSchema), async (c) => {
  const body = c.req.valid("json");
  const response = await weekPlanservice.getWeekPlanByStartDate(body);

  if (!response) {
    return c.json({ message: "Week plan not found" }, 404);
  }

  return c.json(response, 200);
});

app.put("/day/recipe", zValidator("json", dayPlanInsertSchema), async (c) => {
  const body = c.req.valid("json");
  const response = await dayPlanservice.assingRecipeToDayPlan(body);

  return c.json(response, 200);
});

app.delete("/day/recipe/:dayPlan_Id", async (c) => {
  const dayPlanId = c.req.param("dayPlan_Id");
  const response = dayPlanservice.deleteRecipeByDayPlanId(Number(dayPlanId));

  return c.json(response, 200);
});

export default app;
