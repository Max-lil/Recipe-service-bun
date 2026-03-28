import { Hono } from "hono";
import { testRoutes } from "./routes/test";
import { cors } from "hono/cors";
import recipeRouter from "./features/recipe/recipe-router";
import userRouter from "./features/user/user-router";
import planningRouter from "./features/planning/planning-router";
import ingredientRouter from "./features/ingredient/ingredient-router";
import shoppinglistRouter from "./features/shoppinglist/shoppinglist-router";

const app = new Hono();

app.use(
  "*",
  cors({
    origin: [
      "http://localhost:5173",
      "https://recipes-client-360907376023.europe-north2.run.app",
    ],
  }),
);

app.get("/", (c) => c.json({ message: "API is running" }));
app.get("/health", (c) => c.text("ok"));

app.route("/test", testRoutes);
app.route("/recipes", recipeRouter);
app.route("/users", userRouter);
app.route("/planning", planningRouter);
app.route("/ingredients", ingredientRouter);
app.route("/shoppinglist", shoppinglistRouter);

const port = Number(process.env.PORT ?? 8080);

Bun.serve({
  port,
  hostname: "0.0.0.0",
  fetch: app.fetch,
});

console.log(`Server running on http://localhost:${port}`);
