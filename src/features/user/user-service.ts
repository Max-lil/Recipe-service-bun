import { db } from "../../db/drizzle";
import { users } from "../../db/drizzle/schema";
import { ApiUserSelectSchema } from "./user-model";

export const getAllUsers = async (): Promise<ApiUserSelectSchema[]> => {
  return db.select().from(users);
};
