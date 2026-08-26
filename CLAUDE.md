# CLAUDE.md

This file gives Claude Code a working picture of this repository so a session can orient quickly without rediscovering everything from scratch.

## Project overview

This is the **backend API** for a Swedish-oriented recipe and meal-planning app. It is one half of a two-repo full-stack project: the frontend lives in a separate repository, runs on `localhost:5173` in dev, and is deployed at `recipes-client-*.run.app`. Users can scrape recipes from external URLs (or add them manually), plan meals across a week by assigning recipes to days, and get a shopping list that's auto-derived from the ingredients of the recipes planned for that week, plus manually-added items.

## Tech stack

- **Runtime**: Bun (not Node) — uses `Bun.serve`, `bun --watch`, and Bun's built-in test runner.
- **Web framework**: Hono.
- **Database**: PostgreSQL, accessed via **Drizzle ORM** (`drizzle-orm/node-postgres`).
- **Validation**: Zod v4, wired into routes via `@hono/zod-validator`; `drizzle-zod` derives Zod schemas from Drizzle table definitions.
- **Dates**: `date-fns`.
- **Testing**: `bun:test` (Bun's built-in runner) — no test framework config beyond that.
- No ESLint config and no Prettier config file exist in this repo, even though `prettier` is a devDependency.

## Architecture / directory structure

The code is **feature-sliced**, not layered by type. Each domain under `src/features/` owns its own router, service, and model files rather than sharing a global `routes/`, `controllers/`, or `models/` folder:

```
src/
├── index.ts                  # app bootstrap: Hono app, CORS, route mounting, Bun.serve
├── routes/test.ts            # standalone debug route, not feature-sliced
├── db/drizzle/
│   ├── schema.ts              # source of truth for all tables
│   ├── relations.ts           # drizzle relations between tables
│   └── (migrations + meta/)
└── features/
    ├── recipe/        recipe-router.ts, recipe-service.ts, recipe-model.ts, recipe-scraper.ts
    ├── ingredient/     ingredient-router.ts, ingredient-service.ts, ingredient-model.ts
    ├── planning/       planning-router.ts, weekPlan-*, dayPlan-*, planning-date-utils.ts
    ├── shoppinglist/   shoppinglist-router.ts, shoppinglist-service.ts, shoppinglist-model.ts
    └── user/           user-router.ts, user-service.ts, user-model.ts
```

The convention within a feature is **router → service → model**: the router does request parsing/validation (Zod via `zValidator`) and calls into the service; the service holds business logic and Drizzle queries; the model holds Zod/`drizzle-zod` schemas and inferred types. Follow this shape when adding new endpoints rather than introducing a new layering style.

## Commands

- `bun run dev` — start the dev server with file-watch (`bun --watch src/index.ts`).
- `bun run start` — start without watch (used in the Docker image / production).
- `bun test` — run tests (there is no `test` script defined in `package.json`; invoke the Bun runner directly).
- `bun run db:generate` — generate a Drizzle migration from schema changes.
- `bun run db:migrate` — apply migrations.
- `bun run db:push` — push schema directly (no migration file).
- `bun run db:studio` — open Drizzle Studio.
- There is no `build`, `lint`, or `format` script — don't assume one exists.

## API surface

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | API status message |
| GET | `/health` | Health check (used by the Cloud Run deploy workflow) |
| GET | `/test/tables` | Debug: lists all Drizzle schema table names |
| GET | `/recipes` | List all recipes |
| POST | `/recipes` | Create a recipe manually |
| POST | `/recipes/add` | Duplicate of `POST /recipes` — see Known Issues |
| POST | `/recipes/scrape` | Scrape a recipe from a URL, upsert by URL, resync affected shopping lists |
| GET | `/users` | List all users |
| GET | `/planning/days` | List all day plans |
| GET | `/planning/week?userId&weekStartDate` | Fetch a week plan (`weekStartDate` must be a Monday; 404 if missing) |
| POST | `/planning/week` | Get-or-create a week plan (ensures 7 day-plan rows exist) |
| PUT | `/planning/week` | Save/replace a week's day→recipe assignments, then resync shopping list |
| PUT | `/planning/day/recipe` | Assign or clear a recipe on one day plan, resync shopping list |
| DELETE | `/planning/day/recipe/:dayPlanId` | Remove the recipe from a day plan, resync shopping list |
| GET | `/ingredients/:recipeId` | List ingredients for a recipe |
| GET | `/shoppinglist/:weekPlanId` | Get the shopping list for a week plan |
| POST | `/shoppinglist/:weekPlanId` | Add/merge a manual item into a week's shopping list |

There are no routes for creating users, deleting recipes, or authentication.

## Database

Schema lives in `src/db/drizzle/schema.ts`, relations in `relations.ts`. It was originally introspected from a pre-existing database (FK constraint names look Hibernate/Spring-Boot-generated), so don't be surprised by naming that doesn't look hand-written.

Tables:
- **users** — `id`, `email`, `name`.
- **recipes** — `id`, `title`, `url` (nullable), `ingredientsRaw` (nullable).
- **ingredient** — `id`, `name`, `quantity`, `unit`, `rawText`, FK → `recipes`.
- **weekPlan** — `id`, `status`, `weekStartDate`, FK → `users`; unique on `(weekStartDate, userId)`.
- **dayPlan** — `id`, `plannedDate`, FK → `recipes` (nullable), FK → `weekPlan`; unique on `(plannedDate, weekPlanId)`.
- **shoppingListItem** — `id`, `checked`, `name`, `quantity`, `manualQuantity` (default 0), `unit`, FK → `weekPlan`; unique on `(name, unit, weekPlanId)`.

Connection: `src/db/drizzle/index.ts` uses `DATABASE_URL` directly if set (local dev). Otherwise it falls back to `DB_USER` / `DB_PASSWORD` / `DB_NAME` / `CLOUD_SQL_CONNECTION_NAME` and connects over a Unix socket at `/cloudsql/${CLOUD_SQL_CONNECTION_NAME}` — this is the Cloud Run/Cloud SQL production path.

When changing `schema.ts`, run `db:generate` then `db:migrate` (or `db:push` for a quick local sync) rather than hand-writing SQL.

## Conventions & patterns

- **Validation errors**: routes using `zValidator` return `{ message: "Invalid request body", errors: result.error }` with status 400 on failure — match this shape for new validated routes.
- **Transactions**: multi-step writes that must be atomic (e.g. scraping+saving a recipe, saving a week plan, assigning/clearing a day plan's recipe) use `db.transaction()` together with a `getTransactionDatabase(transaction)` cast helper repeated per service file. Reuse this pattern rather than inventing a new one.
- **Shopping list resync**: any time a day plan's recipe or a recipe's ingredients change, `syncShoppingListForWeekPlan` (in `shoppinglist-service.ts`) is called to regroup shopping list items from the week's currently-assigned recipes, while preserving manually-entered quantities (`manualQuantity`). Any new mutation that changes what's planned for a week should trigger this too.
- **Recipe scraping** (`recipe-scraper.ts`): tries `schema.org` JSON-LD first, falls back to DOM heuristics (`itemprop="recipeIngredient"`, list items under ingredient-related classes). Includes Swedish unit normalization (`msk`, `tsk`, `dl`, etc.) and fraction parsing. Scrape-specific failures throw `RecipeScrapeError` (carries an HTTP status), caught in the recipe router and mapped to 400/422/502.
- **No auth**: there's no session/JWT/login system. `userId` is passed as a plain request parameter — don't assume any authorization layer exists.
- **No global error handler or request logging middleware** in `src/index.ts` — errors not caught locally will surface as generic 500s.
- **CORS**: `src/index.ts` allowlists exactly two origins (`http://localhost:5173` and the deployed frontend URL). Update this list if the frontend's origin changes.

## Coding style

This project deliberately optimizes for **simple, explicit, beginner-readable code** over clever or "impressive" TypeScript — that's the whole point of `CODING_STYLE.md`, which is the canonical version of these rules and should be read in full before making non-trivial changes here. In short, when working in this repo:

- Default to straightforward code that reads top-to-bottom without needing to hold much in your head — plain `if` statements over clever one-liners, small route handlers, focused service functions.
- Don't reach for advanced TypeScript features or abstractions unless the existing code already uses them or there's a concrete need — a little repetition is fine if it keeps things easy to follow.
- Match the style already present in the file/feature you're touching rather than introducing a new pattern.
- Keep comments sparse — only where they add real information a reader wouldn't get from the code itself.
- The target reader is someone without deep TypeScript experience, so if a "clever" version and a "boring" version both work, pick the boring one.

## Known issues

Things to be aware of — not necessarily to fix unless asked:

- **README port mismatch**: `README.md` tells you to open `http://localhost:3000`, but the server actually defaults to port `8080` (see `src/index.ts`/`Dockerfile`), and the local `.env` sets `PORT=3001`. The README is stale.
- **Duplicate recipe-create route**: `POST /recipes` and `POST /recipes/add` have identical handlers in `recipe-router.ts`. Likely leftover duplication rather than intentional.
- **Unused scraping dependencies**: `cheerio` and `htmlparser2` are installed but `recipe-scraper.ts` implements its own hand-rolled regex-based HTML tokenizer instead of using either of them.

## Environment variables

No `.env.example` exists — infer required vars from `src/db/drizzle/index.ts` and the local `.env`:

- `DATABASE_URL` — full Postgres connection string, used when present (local dev default).
- `PORT` — server port (defaults to `8080` if unset).
- `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `CLOUD_SQL_CONNECTION_NAME` — used instead of `DATABASE_URL` in the Cloud Run/Cloud SQL production path.
