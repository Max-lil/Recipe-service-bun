import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { recipes } from "../../db/drizzle/schema";
import { ingredientSelectSchema } from "../ingredient/ingredient-model";

export const recipeSelectSchema = createSelectSchema(recipes);

const requiredRecipeUrlSchema = z
  .string()
  .trim()
  .url()
  .refine(
    (value) => value.startsWith("http://") || value.startsWith("https://"),
    "URL must start with http:// or https://",
  );

const normalizeOptionalRecipeUrl = (value: unknown) => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    return value;
  }

  const trimmedValue = value.trim();
  return trimmedValue === "" ? null : trimmedValue;
};

const optionalRecipeUrlSchema = z.preprocess(
  normalizeOptionalRecipeUrl,
  requiredRecipeUrlSchema.nullable().optional(),
);

export const recipeCreateSchema = createInsertSchema(recipes, {
  title: (schema) => schema.trim().min(1),
  url: optionalRecipeUrlSchema,
}).omit({ userId: true });

export const recipeBasicSchema = recipeSelectSchema.pick({
  id: true,
  title: true,
  url: true,
});

export const recipeScrapeRequestSchema = z.object({
  url: requiredRecipeUrlSchema,
  title: z.string().trim().min(1).nullable().optional(),
});

export const recipeSavedSchema = recipeSelectSchema.pick({
  id: true,
  title: true,
  url: true,
  ingredientsRaw: true,
});

export const recipeSavedIngredientSchema = ingredientSelectSchema.pick({
  id: true,
  recipeId: true,
  name: true,
  quantity: true,
  unit: true,
  rawText: true,
});

export const recipeScrapeResponseSchema = z.object({
  recipe: recipeSavedSchema,
  ingredients: z.array(recipeSavedIngredientSchema),
});

export type ApiRecipeSelectSchema = z.infer<typeof recipeSelectSchema>;
export type ApiRecipeCreateSchema = z.infer<typeof recipeCreateSchema>;
export type ApiRecipeBasicSchema = z.infer<typeof recipeBasicSchema>;
export type ApiRecipeScrapeRequestSchema = z.infer<
  typeof recipeScrapeRequestSchema
>;
export type ApiRecipeSavedSchema = z.infer<typeof recipeSavedSchema>;
export type ApiRecipeSavedIngredientSchema = z.infer<
  typeof recipeSavedIngredientSchema
>;
export type ApiRecipeScrapeResponseSchema = z.infer<
  typeof recipeScrapeResponseSchema
>;
