import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { weekPlanRequestSchema, weekPlanSaveSchema } from "./weekPlan-model";
import { dayPlanInsertSchema } from "./dayPlan-model";
import * as dayPlanService from "./dayPlan-service";
import * as weekPlanService from "./weekPlan-service";
import { requireAuth, type AuthVariables } from "../../utils/require-auth";

const router = new Hono<{ Variables: AuthVariables }>();

router.use("*", requireAuth);

router.get("/days", async (c) => {
  const dayPlans = await dayPlanService.getAllDayPlansForUser(
    c.get("userId"),
  );
  return c.json(dayPlans, 200);
});

router.get("/week", zValidator("query", weekPlanRequestSchema), async (c) => {
  const query = c.req.valid("query");
  const weekPlan = await weekPlanService.getSavedWeekPlan({
    ...query,
    userId: c.get("userId"),
  });

  if (!weekPlan) {
    return c.json({ message: "Week plan not found" }, 404);
  }

  return c.json(weekPlan, 200);
});

router.post("/week", zValidator("json", weekPlanRequestSchema), async (c) => {
  const body = c.req.valid("json");
  const weekPlan = await weekPlanService.getOrCreateWeekPlan({
    ...body,
    userId: c.get("userId"),
  });

  return c.json(weekPlan, 200);
});

router.put("/week", zValidator("json", weekPlanSaveSchema), async (c) => {
  const body = c.req.valid("json");
  const weekPlan = await weekPlanService.saveWeekPlan({
    ...body,
    userId: c.get("userId"),
  });

  return c.json(weekPlan, 200);
});

router.put("/day/recipe", zValidator("json", dayPlanInsertSchema), async (c) => {
  const body = c.req.valid("json");
  const ownerId = await dayPlanService.getDayPlanOwnerId(body.id);

  if (ownerId === null) {
    return c.json({ message: "Day plan not found" }, 404);
  }
  if (ownerId !== c.get("userId")) {
    return c.json({ message: "Forbidden" }, 403);
  }

  const dayPlan = await dayPlanService.assignRecipeToDayPlan(body);

  return c.json(dayPlan, 200);
});

router.delete("/day/recipe/:dayPlanId", async (c) => {
  const dayPlanId = Number(c.req.param("dayPlanId"));
  const ownerId = await dayPlanService.getDayPlanOwnerId(dayPlanId);

  if (ownerId === null) {
    return c.json({ message: "Day plan not found" }, 404);
  }
  if (ownerId !== c.get("userId")) {
    return c.json({ message: "Forbidden" }, 403);
  }

  const dayPlan = await dayPlanService.deleteRecipeByDayPlanId(
    dayPlanId,
  );

  return c.json(dayPlan, 200);
});

export default router;
