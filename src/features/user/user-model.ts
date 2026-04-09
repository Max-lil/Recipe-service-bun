import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "../../db/drizzle/schema";

export const userSelectSchema = createSelectSchema(users);

export type ApiUserSelectSchema = z.infer<typeof userSelectSchema>;
