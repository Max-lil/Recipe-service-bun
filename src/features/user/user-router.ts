import { Hono } from "hono";
import * as service from "./user-service";

const app = new Hono();

app.get("/", async (c) => {
  const users = await service.getAllUsers();
  return c.json(users, 200);
});

export default app;
