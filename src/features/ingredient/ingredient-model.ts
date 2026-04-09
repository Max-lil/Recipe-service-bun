import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { ingredient } from "../../db/drizzle/schema";

export const ingredientSelectSchema = createSelectSchema(ingredient);

export type ApiIngredientSelectSchema = z.infer<typeof ingredientSelectSchema>;
