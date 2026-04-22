import { z } from "zod";

export const shoppingListManualItemSchema = z.object({
  name: z.string().trim().min(1),
  unit: z.string().trim().min(1),
  quantity: z.number().nullable(),
});

export type ApiShoppingListManualItemSchema = z.infer<
  typeof shoppingListManualItemSchema
>;
