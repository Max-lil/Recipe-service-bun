import { cors } from "hono/cors";
import { Hono } from "hono";
import ingredientRoutes from "./features/ingredient/ingredient-router";
import planningRoutes from "./features/planning/planning-router";
import recipeRoutes from "./features/recipe/recipe-router";
import shoppingListRoutes from "./features/shoppinglist/shoppinglist-router";
import userRoutes from "./features/user/user-router";
import { testRoutes } from "./routes/test";
import { auth } from "./utils/auth";
import { allowedOrigins } from "./utils/cors-origins";

const app = new Hono();

app.use(
  "*",
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);

app.get("/", (c) => c.json({ message: "API is running" }));
app.get("/health", (c) => c.text("ok"));

app.on(["POST", "GET"], "/api/auth/*", (c) => {
  const forwardedFor = c.req.header("x-forwarded-for");
  const ips = forwardedFor?.split(",").map((ip) => ip.trim()) ?? [];
  // Cloud Run sits behind Google's front end (GFE), which always appends
  // "<client-ip>,<gfe-ip>" to X-Forwarded-For — so the second-to-last entry
  // is the verified client IP. Falls back to the only entry when there's
  // just one (e.g. no GFE hop, like local dev behind a plain reverse proxy).
  const clientIp = ips.length >= 2 ? ips[ips.length - 2] : ips[0];

  const headers = new Headers(c.req.raw.headers);
  if (clientIp) headers.set("x-client-ip", clientIp);
  const request = new Request(c.req.raw, { headers });

  return auth.handler(request);
});

app.route("/test", testRoutes);
app.route("/recipes", recipeRoutes);
app.route("/users", userRoutes);
app.route("/planning", planningRoutes);
app.route("/ingredients", ingredientRoutes);
app.route("/shoppinglist", shoppingListRoutes);

const port = Number(process.env.PORT ?? 8080);

Bun.serve({
  port,
  hostname: "0.0.0.0",
  fetch: app.fetch,
});

console.log(`Server running on http://localhost:${port}`);
