import { cors } from "hono/cors";
import { Hono } from "hono";
import ingredientRoutes from "./features/ingredient/ingredient-router";
import planningRoutes from "./features/planning/planning-router";
import recipeRoutes from "./features/recipe/recipe-router";
import shoppingListRoutes from "./features/shoppinglist/shoppinglist-router";
import userRoutes from "./features/user/user-router";
import { testRoutes } from "./routes/test";

const allowedOrigins = [
  "http://localhost:5173",
  "https://recipes-client-360907376023.europe-north2.run.app",
];

const app = new Hono();

app.use(
  "*",
  cors({
    origin: allowedOrigins,
  }),
);

app.get("/", (c) => c.json({ message: "API is running" }));
app.get("/health", (c) => c.text("ok"));

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
