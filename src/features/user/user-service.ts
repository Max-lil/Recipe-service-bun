import { db } from "../../db/drizzle/index";
import { users } from "../../db/drizzle/schema";
import type { ApiUserSelectSchema } from "./user-model";

export const getAllUsers = async (): Promise<ApiUserSelectSchema[]> => {
  const userRows = await db.select().from(users);
  return userRows;
};
