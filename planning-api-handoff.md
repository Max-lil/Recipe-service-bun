# Planning API update for frontend weekly draft flow

We are changing the frontend to use local draft state for the full week and save once with a single request.

## Required endpoints

### 1. Fetch saved week only
`GET /planning/week?userId={userId}&weekStartDate={yyyy-MM-dd}`

Behavior:
- return existing saved week plan if it exists
- do not create rows on read
- return `404` if no saved week exists

Response:
```ts
type WeekPlan = {
  id: number;
  weekStartDate: string;
  status: string | null;
  days: {
    id: number;
    plannedDate: string;
    recipe: {
      id: number;
      title: string;
      url: string;
    } | null;
  }[];
};
```

### 2. Save full week
`PUT /planning/week`

Request:
```ts
type SaveWeekPlanRequest = {
  userId: number;
  weekStartDate: string; // yyyy-MM-dd
  days: {
    plannedDate: string; // yyyy-MM-dd
    recipeId: number | null;
  }[];
};
```

Behavior:
- create `week_plan` if missing
- upsert all 7 `day_plan` rows in one transaction
- allow `recipeId: null` to clear a day
- validate that the submitted days match `weekStartDate` through `weekStartDate + 6`
- return the normalized saved `WeekPlan` response above

## Important behavior changes
- opening a week must no longer create a week automatically
- saving the week is the only time persistent planning rows should be created or changed
- the frontend will use the returned `week.id` as the source for shopping list lookups

## Temporary compatibility
The old `PUT /planning/day/recipe` endpoint can stay for now if useful internally, but the frontend weekly planner should not depend on it.
