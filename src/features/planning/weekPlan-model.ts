import { addDays, format, getDay, isValid, parseISO } from "date-fns";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { weekPlan } from "../../db/drizzle/schema";
import { recipeBasicSchema } from "../recipe/recipe-model";

export const weekPlanSelectSchema = createSelectSchema(weekPlan);

const isValidIsoDateString = (value: string) => {
  const parsedDate = parseISO(value);
  return isValid(parsedDate) && format(parsedDate, "yyyy-MM-dd") === value;
};

const isoDateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected date format yyyy-MM-dd")
  .refine(isValidIsoDateString, "Invalid calendar date");

const mondayDateStringSchema = isoDateStringSchema.refine(
  (value) => getDay(parseISO(value)) === 1,
  "weekStartDate must be a Monday",
);

export const buildWeekDates = (weekStartDate: string): string[] => {
  const startDate = parseISO(weekStartDate);
  const weekDates: string[] = [];

  for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
    weekDates.push(format(addDays(startDate, dayOffset), "yyyy-MM-dd"));
  }

  return weekDates;
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

    for (let index = 0; index < value.days.length; index += 1) {
      const day = value.days[index];

      if (day.plannedDate !== expectedDates[index]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["days", index, "plannedDate"],
          message: `plannedDate must match ${expectedDates[index]}`,
        });
      }
    }
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
