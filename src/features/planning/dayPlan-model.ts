import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { dayPlan } from "../../db/drizzle/schema";

export const dayPlanSelectSchema = createSelectSchema(dayPlan);
export const dayPlanInsertSchema = z.object({
  id: z.number().int().positive(),
  recipeId: z.number().int().positive().nullable(),
});

export type ApiDayPlanSelectSchema = z.infer<typeof dayPlanSelectSchema>;
export type ApiDayPlanInsertSchema = z.infer<typeof dayPlanInsertSchema>;
