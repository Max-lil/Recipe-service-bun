import { Hono } from "hono";
import * as userService from "./user-service";
import { requireAuth, type AuthVariables } from "../../utils/require-auth";

const router = new Hono<{ Variables: AuthVariables }>();

router.use("*", requireAuth);

router.get("/", async (c) => {
  const users = await userService.getAllUsers();
  return c.json(users, 200);
});

export default router;
