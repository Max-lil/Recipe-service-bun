import { createSelectSchema } from "drizzle-zod";
import { ingredient } from "../../db/drizzle/schema";
import z from "zod";

export const ingredientSelectSchema = createSelectSchema(ingredient);

export type ApiIngredientSelectSchema = z.infer<typeof ingredientSelectSchema>;
