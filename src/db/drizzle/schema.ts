import { pgTable, bigint, varchar, foreignKey, unique, boolean, real, text, date, timestamp, pgSequence } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"


export const usersSeq = pgSequence("users_seq", {  startWith: "1", increment: "50", minValue: "1", maxValue: "9223372036854775807", cache: "1", cycle: false })

export const users = pgTable("users", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "users_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	email: varchar({ length: 255 }).notNull(),
	name: varchar({ length: 255 }).notNull(),
	// Added for better-auth: it manages these fields on the user model.
	emailVerified: boolean("email_verified").notNull().default(false),
	image: text("image"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
	// Added for better-auth's username plugin.
	username: varchar("username", { length: 255 }),
	displayUsername: varchar("display_username", { length: 255 }),
}, (table) => [
	unique("uk_users_email").on(table.email),
	unique("uk_users_username").on(table.username),
]);

export const session = pgTable("session", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "session_id_seq", startWith: 1, increment: 1 }),
	expiresAt: timestamp("expires_at").notNull(),
	token: text("token").notNull(),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	userId: bigint("user_id", { mode: "number" }).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "fk_session_user_id"
		}).onDelete("cascade"),
	unique("uk_session_token").on(table.token),
]);

export const account = pgTable("account", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "account_id_seq", startWith: 1, increment: 1 }),
	// better-auth's own account model requires this (tracks which OAuth/OIDC issuer, or "credential" for email+password).
	issuer: text("issuer").notNull(),
	accountId: text("account_id").notNull(),
	providerId: text("provider_id").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	userId: bigint("user_id", { mode: "number" }).notNull(),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	accessTokenExpiresAt: timestamp("access_token_expires_at"),
	refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
	scope: text("scope"),
	password: text("password"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "fk_account_user_id"
		}).onDelete("cascade"),
	unique("uk_account_issuer_account").on(table.issuer, table.accountId),
]);

export const verification = pgTable("verification", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "verification_id_seq", startWith: 1, increment: 1 }),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: timestamp("expires_at").notNull(),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const shoppingListItem = pgTable("shopping_list_item", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "shopping_list_item_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	checked: boolean().notNull(),
	name: varchar({ length: 255 }).notNull(),
	quantity: real().notNull(),
	manualQuantity: real("manual_quantity").notNull().default(0),
	unit: varchar({ length: 255 }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	weekPlanId: bigint("week_plan_id", { mode: "number" }).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.weekPlanId],
			foreignColumns: [weekPlan.id],
			name: "fkh1g3km8b60e05hnfbkwlequ72"
		}),
	unique("uk_shopping_list_week_name_unit").on(table.name, table.unit, table.weekPlanId),
]);

export const recipes = pgTable("recipes", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "recipes_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	title: varchar({ length: 255 }).notNull(),
	url: varchar({ length: 255 }),
	ingredientsRaw: text("ingredients_raw"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	userId: bigint("user_id", { mode: "number" }).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "fk_recipes_user_id"
		}).onDelete("cascade"),
	unique("uk_recipes_user_url").on(table.userId, table.url),
]);

export const weekPlan = pgTable("week_plan", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "week_plan_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	status: varchar({ length: 255 }),
	weekStartDate: date("week_start_date").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	userId: bigint("user_id", { mode: "number" }).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "fk1rg7wnw31v9uq8x5jsu78ns6e"
		}),
	unique("uk_week_plan_user_week_start").on(table.weekStartDate, table.userId),
]);

export const dayPlan = pgTable("day_plan", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "day_plan_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	plannedDate: date("planned_date").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	recipeId: bigint("recipe_id", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	weekPlanId: bigint("week_plan_id", { mode: "number" }).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.recipeId],
			foreignColumns: [recipes.id],
			name: "fk4ukvjvqkenqf92tlvj5gdmlol"
		}),
	foreignKey({
			columns: [table.weekPlanId],
			foreignColumns: [weekPlan.id],
			name: "fkk3qwg90npoo0btw5hfh2d5ytu"
		}),
	unique("uk_day_plan_week_plan_date").on(table.plannedDate, table.weekPlanId),
]);

export const ingredient = pgTable("ingredient", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "ingredient_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	name: varchar({ length: 255 }).notNull(),
	quantity: real(),
	unit: varchar({ length: 255 }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	recipeId: bigint("recipe_id", { mode: "number" }).notNull(),
	rawText: text("raw_text"),
}, (table) => [
	foreignKey({
			columns: [table.recipeId],
			foreignColumns: [recipes.id],
			name: "fk88h2tluyw2likhrjlciynjg90"
		}),
]);
