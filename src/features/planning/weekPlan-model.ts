import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { weekPlan } from "../../db/drizzle/schema";
import z from "zod";
import { recipeBasicSchema } from "../recipe/recipe-model";

export const weekPlanCreateSchema = createInsertSchema(weekPlan);
export const weekPlanSelectSchema = createSelectSchema(weekPlan);
export const weekPlanRequestSchema = z.object({
  userId: z.number(),
  startDate: z.string(),
});
export const weekPlanDayResponseSchema = z.object({
  id: z.number(),
  plannedDate: z.string(),
  recipe: recipeBasicSchema.nullable(),
});
export const weekPlanResponseSchema = z.object({
  id: z.number(),
  weekStartDate: z.string(),
  status: z.string().nullable(),
  days: z.array(weekPlanDayResponseSchema),
});

export type ApiWeekPlanInsertSchema = z.infer<typeof weekPlanCreateSchema>;
export type ApiWeekPlanSelectSchema = z.infer<typeof weekPlanSelectSchema>;
export type ApiWeekPlanRequestSchema = z.infer<typeof weekPlanRequestSchema>;
export type ApiWeekPlanDayResponseSchema = z.infer<
  typeof weekPlanDayResponseSchema
>;
export type ApiWeekPlanResponseSchema = z.infer<typeof weekPlanResponseSchema>;
