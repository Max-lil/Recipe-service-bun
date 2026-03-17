import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { dayPlan } from "../../db/drizzle/schema";

export const dayPlanSelectSchema = createSelectSchema(dayPlan);
export const dayPlanInsertSchema = createInsertSchema(dayPlan);

export type ApiDayPlanSelectSchema = z.infer<typeof dayPlanSelectSchema>;
export type ApiDayPlanInsertSchema = z.infer<typeof dayPlanInsertSchema>;
