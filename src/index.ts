import { Hono } from "hono";
import { testRoutes } from "./routes/test";
import recipeRouter from "./features/recipe/recipe-router";
import userRouter from "./features/user/user-router";
import planningRouter from "./features/planning/planning-router";
import ingredientRouter from "./features/ingredient/ingredient-router";

const app = new Hono();

app.get("/", (c) => c.json({ message: "API is running" }));
app.get("/health", (c) => c.text("ok"));

app.route("/test", testRoutes);
app.route("/recipes", recipeRouter);
app.route("/users", userRouter);
app.route("/planning", planningRouter);
app.route("/ingredients", ingredientRouter);

const port = Number(process.env.PORT ?? 8080);

Bun.serve({
  port,
  fetch: app.fetch,
});

console.log(`Server running on http://localhost:${port}`);
