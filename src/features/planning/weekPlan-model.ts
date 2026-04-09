import { createSelectSchema } from "drizzle-zod";
import { weekPlan } from "../../db/drizzle/schema";
import z from "zod";
import { recipeBasicSchema } from "../recipe/recipe-model";
import { addDays, format, getDay, isValid, parseISO } from "date-fns";

export const weekPlanSelectSchema = createSelectSchema(weekPlan);
const isoDateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected date format yyyy-MM-dd")
  .refine((value) => {
    const parsedDate = parseISO(value);
    return isValid(parsedDate) && format(parsedDate, "yyyy-MM-dd") === value;
  }, "Invalid calendar date");

const mondayDateStringSchema = isoDateStringSchema.refine(
  (value) => getDay(parseISO(value)) === 1,
  "weekStartDate must be a Monday",
);

export const buildWeekDates = (weekStartDate: string) => {
  const startDate = parseISO(weekStartDate);
  return Array.from({ length: 7 }, (_, index) =>
    format(addDays(startDate, index), "yyyy-MM-dd"),
  );
};

export const weekPlanRequestSchema = z.object({
  userId: z.coerce.number().int().positive(),
  weekStartDate: mondayDateStringSchema,
});

export const weekPlanSaveDaySchema = z.object({
  plannedDate: isoDateStringSchema,
  recipeId: z.number().int().positive().nullable(),
});

export const weekPlanSaveSchema = z
  .object({
    userId: z.coerce.number().int().positive(),
    weekStartDate: mondayDateStringSchema,
    days: z.array(weekPlanSaveDaySchema).length(7),
  })
  .superRefine((value, ctx) => {
    const expectedDates = buildWeekDates(value.weekStartDate);

    value.days.forEach((day, index) => {
      if (day.plannedDate !== expectedDates[index]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["days", index, "plannedDate"],
          message: `plannedDate must match ${expectedDates[index]}`,
        });
      }
    });
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

export type ApiWeekPlanSelectSchema = z.infer<typeof weekPlanSelectSchema>;
export type ApiWeekPlanRequestSchema = z.infer<typeof weekPlanRequestSchema>;
export type ApiWeekPlanSaveDaySchema = z.infer<typeof weekPlanSaveDaySchema>;
export type ApiWeekPlanSaveSchema = z.infer<typeof weekPlanSaveSchema>;
export type ApiWeekPlanDayResponseSchema = z.infer<
  typeof weekPlanDayResponseSchema
>;
export type ApiWeekPlanResponseSchema = z.infer<typeof weekPlanResponseSchema>;
