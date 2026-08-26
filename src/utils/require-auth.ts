import { createMiddleware } from "hono/factory";
import { auth } from "./auth";

export type AuthVariables = {
  userId: number;
};

// Rejects requests without a valid better-auth session, and makes the
// signed-in user's id available to route handlers via c.get("userId").
export const requireAuth = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });

    if (!session) {
      return c.json({ message: "Unauthorized" }, 401);
    }

    c.set("userId", Number(session.user.id));
    await next();
  },
);
