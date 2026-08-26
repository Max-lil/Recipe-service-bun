# Backend work needed to finish the login/auth integration

The frontend now gates every page behind a better-auth session (redirects to `/login` if
logged out) and sends `credentials: "include"` on every API call so the session cookie reaches
the backend. That surfaced five backend-side gaps that need to be closed for the feature to be
correct and secure, not just "compiles and looks right in the browser."

## 0. Sign-up and sign-in currently return 500 (blocking — found during verification)

While verifying the frontend changes against a locally running backend, both write-path
better-auth endpoints failed. Confirmed with `curl` directly against the backend (no browser,
no frontend code involved, so this isn't a CORS/credentials/frontend issue):

```
POST http://localhost:3001/api/auth/sign-up/email → 500 Internal Server Error (empty body)
POST http://localhost:3001/api/auth/sign-in/email → 500 Internal Server Error (empty body)
GET  http://localhost:3001/api/auth/get-session   → 200 OK, null   (this one works)
```

Sign-up was tried with a fresh, never-used email and still 500'd, so it's not a duplicate-email
case. The response body is empty in both cases, so whatever's throwing only shows up in the
backend process's own logs/stack trace — please check there for the actual error. This blocks
end-to-end verification of the whole login flow from the frontend side (redirect-to-login and
hiding the nav when logged out both work, but nothing past actual login could be confirmed,
including the item 3 userId-type question below, since we can't get a session at all).

## 1. Recipes have no per-user scoping at all

`Recipe` has no `userId` column, and `GET /recipes`, `POST /recipes`, and `POST /recipes/scrape`
are completely global — every account currently sees and adds to the same recipe list. The
frontend now hides `/recipes` from logged-out visitors, but a logged-in user still sees *every*
user's recipes, not just their own, until this is fixed.

Needed:
- Add a `userId` column to the recipe table.
- Scope `GET /recipes` to the requesting user's id (derived from their session, not a query
  param the client could tamper with).
- `POST /recipes` and `POST /recipes/scrape` should stamp the new recipe with the session's
  user id.

## 2. No server-side session validation on any data endpoint today

`/planning/week`, and presumably `/shoppinglist/*` and `/recipes*`, currently trust whatever
`userId` the client sends in the request body/URL with no check that the request's session
actually belongs to that user. Right now the frontend hardcoded `userId = 1` for every user —
that "worked" only because nothing verified it. This is a real authorization gap: anyone hitting
the API directly today can read or write another user's week plan or shopping list just by
changing the `userId` field in the request.

Needed: validate the better-auth session on these endpoints server-side, and derive the acting
user from the verified session instead of trusting a client-supplied `userId`. (Whether that
means rejecting a mismatched client-supplied `userId` outright, or just ignoring it and always
using the session's user id, is up to you — either closes the gap.)

## 3. Possible user id type mismatch

The existing planning/shopping-list contract expects a numeric `userId`
(`loadWeekPlanRequestSchema` / `saveWeekPlanRequestSchema` both use `z.number()`, and the
frontend's placeholder was the literal number `1`). better-auth's default user id is a string
(cuid-style), not a number.

The frontend now sends `Number(session.user.id)` as `userId` to `/planning/week`. Please confirm
one of the following, since it changes what (if anything) needs fixing on your side:
- better-auth is already configured to use the same numeric-id users table the planning/shopping
  list tables reference (in which case `Number(session.user.id)` round-trips correctly and there's
  nothing to do here), **or**
- better-auth's user id is a separate string id unrelated to the numeric ids referenced by
  `week_plan`/`day_plan` rows, in which case `Number(session.user.id)` will produce `NaN` and the
  two id systems need to be reconciled (e.g. configure better-auth against the existing users
  table, or expose a way to resolve one id from the other).

## 4. CORS + credentials

The frontend now sends `credentials: "include"` on every request to the backend, including plain
`GET /recipes`, `/planning/week`, `/shoppinglist/*`, `/ingredients/*` calls that previously sent
no credentials at all. This needs `Access-Control-Allow-Credentials: true` and an explicit
`Access-Control-Allow-Origin` (not a wildcard `*`, which browsers reject for credentialed
requests) for the frontend's dev and production origins.

**Update from verification**: checked the raw response headers on `GET /api/auth/get-session`
(the one better-auth endpoint that currently works — see item 0) and it already returns
`Access-Control-Allow-Credentials: true` plus `Vary: Origin`, so this looks like it's already
configured correctly for at least the dev origin. Worth a quick double-check that the same holds
for the production origin and for the plain data endpoints (`/recipes`, `/planning/week`, etc.,
not just `/api/auth/*`), but this is likely not a blocker.
