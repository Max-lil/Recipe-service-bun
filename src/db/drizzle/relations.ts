import { relations } from "drizzle-orm/relations";
import { weekPlan, shoppingListItem, users, recipes, dayPlan, ingredient } from "./schema";

export const shoppingListItemRelations = relations(shoppingListItem, ({one}) => ({
	weekPlan: one(weekPlan, {
		fields: [shoppingListItem.weekPlanId],
		references: [weekPlan.id]
	}),
}));

export const weekPlanRelations = relations(weekPlan, ({one, many}) => ({
	shoppingListItems: many(shoppingListItem),
	user: one(users, {
		fields: [weekPlan.userId],
		references: [users.id]
	}),
	dayPlans: many(dayPlan),
}));

export const usersRelations = relations(users, ({many}) => ({
	weekPlans: many(weekPlan),
}));

export const dayPlanRelations = relations(dayPlan, ({one}) => ({
	recipe: one(recipes, {
		fields: [dayPlan.recipeId],
		references: [recipes.id]
	}),
	weekPlan: one(weekPlan, {
		fields: [dayPlan.weekPlanId],
		references: [weekPlan.id]
	}),
}));

export const recipesRelations = relations(recipes, ({many}) => ({
	dayPlans: many(dayPlan),
	ingredients: many(ingredient),
}));

export const ingredientRelations = relations(ingredient, ({one}) => ({
	recipe: one(recipes, {
		fields: [ingredient.recipeId],
		references: [recipes.id]
	}),
}));