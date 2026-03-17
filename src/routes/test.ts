import { Hono } from "hono";
import * as schema from "../db/drizzle/schema";

export const testRoutes = new Hono();

testRoutes.get("/tables", async (c) => {
  return c.json({
    tables: Object.keys(schema),
  });
});
