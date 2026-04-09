import { Hono } from "hono";
import * as userService from "./user-service";

const router = new Hono();

router.get("/", async (c) => {
  const users = await userService.getAllUsers();
  return c.json(users, 200);
});

export default router;
