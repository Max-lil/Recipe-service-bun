import { pgTable, text, integer } from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-zod";
import { users } from "../../db/drizzle/schema";
import { z } from "zod";

export const userSelectSchema = createSelectSchema(users);

export type ApiUserSelectSchema = z.infer<typeof userSelectSchema>;
