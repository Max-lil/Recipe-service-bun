import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { weekPlanRequestSchema, weekPlanSaveSchema } from "./weekPlan-model";
import { dayPlanInsertSchema } from "./dayPlan-model";
import * as dayPlanService from "./dayPlan-service";
import * as weekPlanService from "./weekPlan-service";

const router = new Hono();

router.get("/days", async (c) => {
  const dayPlans = await dayPlanService.getAllDayPlans();
  return c.json(dayPlans, 200);
});

router.get("/week", zValidator("query", weekPlanRequestSchema), async (c) => {
  const query = c.req.valid("query");
  const weekPlan = await weekPlanService.getSavedWeekPlan(query);

  if (!weekPlan) {
    return c.json({ message: "Week plan not found" }, 404);
  }

  return c.json(weekPlan, 200);
});

router.post("/week", zValidator("json", weekPlanRequestSchema), async (c) => {
  const body = c.req.valid("json");
  const weekPlan = await weekPlanService.getOrCreateWeekPlan(body);

  return c.json(weekPlan, 200);
});

router.put("/week", zValidator("json", weekPlanSaveSchema), async (c) => {
  const body = c.req.valid("json");
  const weekPlan = await weekPlanService.saveWeekPlan(body);

  return c.json(weekPlan, 200);
});

router.put("/day/recipe", zValidator("json", dayPlanInsertSchema), async (c) => {
  const body = c.req.valid("json");
  const dayPlan = await dayPlanService.assignRecipeToDayPlan(body);

  return c.json(dayPlan, 200);
});

router.delete("/day/recipe/:dayPlanId", async (c) => {
  const dayPlanId = Number(c.req.param("dayPlanId"));
  const dayPlan = await dayPlanService.deleteRecipeByDayPlanId(
    dayPlanId,
  );

  return c.json(dayPlan, 200);
});

export default router;
