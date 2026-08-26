import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username } from "better-auth/plugins";
import { db } from "../db/drizzle";
import { users, session, account, verification } from "../db/drizzle/schema";
import { allowedOrigins } from "./cors-origins";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    // Keyed by modelName ("users", since that's overridden below), not by
    // better-auth's default model name ("user").
    schema: {
      users,
      session,
      account,
      verification,
    },
  }),
  // The users table uses a bigint identity column, not better-auth's default
  // string id, so let Postgres keep generating ids instead of better-auth.
  advanced: {
    database: {
      generateId: false,
    },
  },
  user: {
    modelName: "users",
  },
  emailAndPassword: {
    enabled: true,
  },
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: allowedOrigins,
  plugins: [username()],
});
