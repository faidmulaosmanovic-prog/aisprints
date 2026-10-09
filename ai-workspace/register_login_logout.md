Date created: October 9, 2026
Date last modified: October 9, 2026

# Register, Login, and Logout - Technical PRD

## Overview/Problem

Quiz Maker will be used by many teachers, and each teacher needs their own account. The app is still the unmodified starter: there is no database, no user table, and no way to register or sign in. This feature adds teacher accounts and the register, login, and logout flows that create and enter those accounts. After a successful register or login, the teacher lands on a stub page for multiple-choice quizzes. Question authoring is a later feature.

The account identifier is a database primary key named `id`. It is not a cryptographic private key.

---

## Hypothesis

We believe that username-and-email accounts with register, login, and logout will let many teachers create an account and reach Quiz Maker before multiple-choice questions exist.

---

## Scope

### In Scope

- A Cloudflare D1 database, bound as `DB`, and one local migration that creates the `users` table.
- Columns: primary key, first name, last name, username, email address, and a password hash. Timestamps for create and update.
- Passwords stored only as hashes. Plaintext passwords never written to the database or returned by the API.
- A user service that can add, edit, and delete a user.
- HTTP endpoints that back those operations, plus register, login, and logout:
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `POST /api/auth/logout`
  - `PATCH /api/users/[id]`
  - `DELETE /api/users/[id]`
- A register page and a login page.
- After successful register or login, navigate to `/mcq`.
- `/mcq` is a stub. It states that multiple-choice quizzes will be built later and offers logout.
- Logout calls `POST /api/auth/logout` and then navigates to `/login`.
- The home page links to register and login.
- Vitest unit tests for every phase, written before the production code. A phase starts red and is finished only when `npm test` is green for that phase. Green tests sit next to the acceptance criteria as the completion signal.

### Out of Scope

- Multiple-choice questions, quiz data, question tables, or any MCQ behavior beyond the stub page.
- Social login (Google, GitHub, or any other provider).
- Session management: no cookies, no JSON Web Tokens, no server-side session store, no "remember me", and no protected routes. Login checks the password and returns the public user. It does not leave the teacher signed in after a reload.
- Email verification, password reset, and profile settings UI.
- Roles, admin accounts, and a user list endpoint.
- Applying migrations to the remote D1 database.
- `@cloudflare/vitest-pool-workers`, and any unit test that opens a real D1 database, a real network, or the Workers runtime. Unit tests mock `src/lib/db.ts`. Applying the migration locally, `npm run preview`, and the browser pass stay acceptance checks outside the unit suite.

### Cut

- Session management — deferred on purpose. Logout therefore does not destroy a credential, because login does not issue one. `/mcq` is reachable without an account. A reload of `/mcq` does not know who registered or logged in.
- Edit and delete screens — the service and endpoints exist, but this feature has no account-settings page. Callers of edit and delete must send the current password in the request, because there is no session to identify them.
- A separate `POST /api/users` create endpoint — register is the only way to add a user.

---

## Technical Requirements

### Database Schema

D1 is not configured yet. Create a database named `faid-quiz-maker` (matching the Worker name), bind it as `DB` in `wrangler.jsonc`, then regenerate types with `npm run cf-typegen`. Do not edit `cloudflare-env.d.ts` by hand.

Create the migration with Wrangler, then apply it locally only:

```bash
npx wrangler d1 create faid-quiz-maker
npx wrangler d1 migrations create faid-quiz-maker create-users
npx wrangler d1 migrations apply faid-quiz-maker --local
```

Never run `migrations apply` with `--remote`.

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  username TEXT NOT NULL COLLATE NOCASE,
  email TEXT NOT NULL COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX idx_users_username ON users (username);
CREATE UNIQUE INDEX idx_users_email ON users (email);
```

`password_hash` holds a self-describing PBKDF2 string, not the password:

```text
pbkdf2_sha256$<iterations>$<salt-base64>$<hash-base64>
```

Use the Web Crypto API (PBKDF2, SHA-256, a random 16-byte salt, at least 100,000 iterations). Workers do not need a bcrypt package for this. Store `username` and `email` in lowercase. `COLLATE NOCASE` keeps the unique indexes from treating `Ada` and `ada` as different teachers.

Queries live in `src/lib/` and use prepared statements with numbered placeholders (`?1`, `?2`). Read rows from `all().results`. Do not concatenate user input into SQL.

### API Endpoints

Public user objects omit `password_hash`:

```json
{
  "id": "abc123",
  "firstName": "Ada",
  "lastName": "Lovelace",
  "username": "ada",
  "email": "ada@school.edu",
  "createdAt": "2026-10-09T12:00:00.000Z",
  "updatedAt": "2026-10-09T12:00:00.000Z"
}
```

Validate every body with Zod before calling the service. Map database unique violations to `409`.

#### POST /api/auth/register

Adds a user. This is the only create path.

**Request Body:**

```json
{
  "firstName": "Ada",
  "lastName": "Lovelace",
  "username": "ada",
  "email": "ada@school.edu",
  "password": "correct-horse-1"
}
```

**Response:**

- Success (201): `{ "user": <public user> }`
- Error (400): `{ "error": "Validation failed", "fields": { "<field>": "<message>" } }`
- Error (409): `{ "error": "An account with that username or email already exists" }`
- Error (500): `{ "error": "Unable to create account" }`

The client navigates to `/mcq` on 201. The response sets no cookie and returns no token.

#### POST /api/auth/login

Checks the password for a username or an email. Does not create a session.

**Request Body:**

```json
{
  "identifier": "ada",
  "password": "correct-horse-1"
}
```

`identifier` is either the username or the email.

**Response:**

- Success (200): `{ "user": <public user> }`
- Error (400): `{ "error": "Validation failed", "fields": { "<field>": "<message>" } }`
- Error (401): `{ "error": "Incorrect username, email, or password" }`
- Error (500): `{ "error": "Unable to sign in" }`

Use the same 401 message for an unknown account and a wrong password. The client navigates to `/mcq` on 200.

#### POST /api/auth/logout

Acknowledges logout. There is no session to delete, so this endpoint changes no database row.

**Request Body:** empty

**Response:**

- Success (200): `{ "ok": true }`
- Error (500): `{ "error": "Unable to sign out" }`

The client navigates to `/login` after a 200.

#### PATCH /api/users/[id]

Edits first name, last name, username, email, and optionally the password. No settings page calls this in the current feature. The current password is required because there is no session.

**Request Body:**

```json
{
  "currentPassword": "correct-horse-1",
  "firstName": "Ada",
  "lastName": "Byron",
  "username": "ada",
  "email": "ada@school.edu",
  "newPassword": "optional-new-password-1"
}
```

`newPassword` may be omitted. The other profile fields are required.

**Response:**

- Success (200): `{ "user": <public user> }`
- Error (400): validation error, same shape as register
- Error (401): `{ "error": "Incorrect password" }`
- Error (404): `{ "error": "User not found" }`
- Error (409): `{ "error": "An account with that username or email already exists" }`
- Error (500): `{ "error": "Unable to update account" }`

#### DELETE /api/users/[id]

Deletes the user after the current password matches. No screen calls this in the current feature.

**Request Body:**

```json
{
  "currentPassword": "correct-horse-1"
}
```

**Response:**

- Success (200): `{ "ok": true }`
- Error (400): `{ "error": "Validation failed", "fields": { "currentPassword": "<message>" } }`
- Error (401): `{ "error": "Incorrect password" }`
- Error (404): `{ "error": "User not found" }`
- Error (500): `{ "error": "Unable to delete account" }`

### User Interface Requirements

Use the existing shadcn/ui components (`button`, `card`, `field`, `input`, `label`). Keep `'use client'` on the form components only. Forms `POST` JSON to the endpoints above. Show the API error message on failure. Disable the submit button while the request is in flight.

Shared field rules:

| Field | Rules |
| --- | --- |
| First name | Required, trimmed, 1–80 characters |
| Last name | Required, trimmed, 1–80 characters |
| Username | Required, 3–32 characters, letters, numbers, and underscores only, stored lowercase |
| Email | Required, valid email, max 254 characters, stored lowercase |
| Password | Required, 8–128 characters, at least one letter and one number |

#### Home (`/`)

- Short line that this is Quiz Maker.
- Links to `/register` and `/login`.

#### Register (`/register`)

- Fields: first name, last name, username, email, password, confirm password.
- Confirm password must match password before submit. Confirm password is not sent to the API.
- Submit calls `POST /api/auth/register`.
- Success navigates to `/mcq`.
- Duplicate username or email shows the 409 message.
- Link to `/login`.

#### Login (`/login`)

- Fields: username or email, password.
- Submit calls `POST /api/auth/login`.
- Success navigates to `/mcq`.
- A failed login shows "Incorrect username, email, or password".
- Link to `/register`.

#### MCQ stub (`/mcq`)

- Heading and one sentence: multiple-choice quizzes are not built yet.
- Logout button calls `POST /api/auth/logout`, then navigates to `/login`.
- No question list, no create-question form, and no auth gate.

---

## Test-Driven Development

Vitest is the test framework for this feature. Unit tests are the fast signal. Acceptance criteria stay the pass/fail list for the feature. A phase is done only when both are true: `npm test` is green for that phase's tests, and the matching acceptance criteria can be checked.

Every phase uses the same cycle:

1. Write that phase's tests first. Run `npm test`. The new tests fail because the production code is missing or wrong. Record that red run. A test that never failed is not the signal.
2. Implement only enough to satisfy those tests.
3. Run `npm test` again. Green means the behavior under test matches this PRD. Then check the acceptance criteria that cite those tests.
4. Leave earlier phases green. Do not weaken an assertion to turn a suite green.

Test rules:

- Colocate tests: `src/lib/password.ts` is tested by `src/lib/password.test.ts`.
- Assert observable results: return values, thrown errors, SQL text and bound parameters, HTTP status and body, and what a user can see or do. Do not assert that a private helper was called.
- Cover the failure path in the same file as the happy path: validation, duplicates, wrong password, missing user.
- Each test passes when run alone. Reset mocks in `beforeEach` with `vi.clearAllMocks()`.
- Mock at the module boundary. Never let a unit test reach a real database or network. Stub `server-only` if a module imports it. Mock `getCloudflareContext` only through `src/lib/db.ts`, so tests do not rebuild the D1 statement chain.
- Name each test so the failure message states what broke.
- Do not add `@cloudflare/vitest-pool-workers` unless the user asks. Schema tests read the migration file. Service and route tests use a fake database module.
- Server Components are not rendered with Testing Library. Pages stay thin. Test the client components that hold the forms, links, and logout button. Query by role and accessible name. Drive input with `@testing-library/user-event`.

Install once, before the Phase 1 tests, so the red run is a failed assertion and not a missing runner:

```bash
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/user-event jsdom vite-tsconfig-paths
```

`vitest.config.ts` at the repo root:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "jsdom",
    globals: true,
  },
});
```

Scripts:

```json
"test": "vitest run",
"test:watch": "vitest"
```

`vite-tsconfig-paths` is required so `@/` resolves in tests.

---

## Implementation Phases

### Phase 1: Database - COMPLETED

**Objective**: Teachers can be stored in a local D1 database, and the schema contract is guarded by tests.

**Red**: Add `migrations/create-users.test.ts`. It reads the SQL file under `migrations/` and fails while that file is absent.

1. The migration creates `users` with `id`, `first_name`, `last_name`, `username`, `email`, `password_hash`, `created_at`, and `updated_at`.
2. `id` is the primary key.
3. `username` and `email` use `COLLATE NOCASE`.
4. Unique indexes exist on `username` and `email`.
5. `wrangler.jsonc` binds that database as `DB`.

Run `npm test` and confirm these tests fail.

**Implement**:

1. Create the D1 database and add the `DB` binding to `wrangler.jsonc`.
2. Run `npm run cf-typegen`.
3. Add the `create-users` migration and apply it locally.

**Green**: `npm test` passes the schema tests. Check the Phase 1 acceptance criteria. Remote D1 stays unchanged. Local apply is an acceptance check, not a Vitest test.

**Deliverables**:

- Vitest is installed and `npm test` runs `vitest run`.
- `wrangler.jsonc` contains `d1_databases` with binding `DB`.
- `migrations/` contains the users migration.
- Local D1 has the `users` table.

### Phase 2: User service - COMPLETED

**Objective**: Account create, update, delete, and password checks go through one service, proven by unit tests against a fake database.

**Red**: Add the tests below before `password.ts`, `users.ts`, and `validators/auth.ts` exist. Run `npm test` and confirm the new tests fail. Keep Phase 1 green.

`src/lib/password.test.ts`

1. A hash starts with `pbkdf2_sha256$` and does not contain the plaintext password.
2. Two hashes of the same password differ.
3. Verify accepts the original password and rejects a different one.

`src/lib/validators/auth.test.ts`

1. Register rejects a blank name, a bad email, a short password, a username outside the allowed characters, and a password with no digit or no letter.
2. Login requires `identifier` and `password`.
3. Update requires `currentPassword` and the profile fields, and allows `newPassword` to be omitted.
4. Delete requires `currentPassword`.

`src/lib/services/users.test.ts` mocks `@/lib/db` and never opens D1.

1. Create stores a PBKDF2 hash, lowercases username and email, and returns a public user with no `password_hash`.
2. Create reports a duplicate username or email and does not insert a second row.
3. Lookup by username and lookup by email find the same account.
4. Update changes the allowed fields when the current password matches, and replaces the hash when `newPassword` is present.
5. Update and delete report an incorrect current password and leave the row in place.
6. Update and delete report a missing user.
7. Delete removes the row when the current password matches.

**Implement**:

1. Add Zod.
2. Add password hash and verify helpers using Web Crypto PBKDF2.
3. Add `src/lib/services/users.ts` with create, update, delete, and find-by-identifier.
4. Normalize username and email to lowercase before write and lookup.
5. Add the Zod schemas the tests import.

**Green**: `npm test` passes Phase 1 and Phase 2. Check the service and password acceptance criteria.

**Deliverables**:

- User service used by every later endpoint.
- Passwords hashed before insert and before any password change.
- Service returns public users only.

### Phase 3: Endpoints - COMPLETED

**Objective**: Register, login, logout, edit, and delete match the HTTP contracts, proven by route tests with the user service mocked.

**Red**: Add route tests that call the handlers with a `Request`. Mock `@/lib/services/users`. Run `npm test` and confirm the new tests fail. Keep Phase 1 and Phase 2 green.

`src/app/api/auth/register/route.test.ts`

1. Valid body returns 201 and a public user, with no `Set-Cookie` header and no token in the body.
2. Invalid body returns 400 and `fields`.
3. A duplicate account returns 409.
4. A service failure returns 500 with "Unable to create account".

`src/app/api/auth/login/route.test.ts`

1. A matching username or email returns 200 and the public user, with no `Set-Cookie` header and no token.
2. An unknown account and a wrong password both return 401 with "Incorrect username, email, or password".
3. Invalid body returns 400.
4. A service failure returns 500 with "Unable to sign in".

`src/app/api/auth/logout/route.test.ts`

1. Returns 200 and `{ "ok": true }`.
2. Does not call create, update, or delete on the user service.

`src/app/api/users/[id]/route.test.ts`

1. Patch with the right current password returns 200 and the public user.
2. Patch returns 400, 401, 404, and 409 for validation, wrong password, missing user, and duplicate username or email.
3. Delete with the right current password returns 200 and `{ "ok": true }`.
4. Delete returns 400, 401, and 404 for validation, wrong password, and missing user.

**Implement**:

1. Add the route handlers under `src/app/api/`.
2. Validate bodies with Zod and map service errors to the status codes in this PRD.
3. Confirm login and logout set no cookie and write no session.

**Green**: `npm test` passes through Phase 3. Check the endpoint acceptance criteria.

**Deliverables**:

- Register, login, logout, update, and delete endpoints match the contracts above.

### Phase 4: Pages - PLANNED

**Objective**: A teacher can register or log in and land on the MCQ stub, then log out. Component tests prove the visible behavior.

**Red**: Add client-component tests before the forms exist. Mock `fetch` and `next/navigation`. Run `npm test` and confirm the new tests fail. Keep earlier phases green.

`src/components/auth/register-form.test.tsx`

1. Confirm-password mismatch shows an error and does not call `fetch`.
2. Invalid fields are rejected before the request.
3. A 201 response navigates to `/mcq`.
4. A 409 response shows "An account with that username or email already exists".
5. The page links to `/login`. The link can live in the form or a sibling tested with it.

`src/components/auth/login-form.test.tsx`

1. A 200 response navigates to `/mcq`.
2. A 401 response shows "Incorrect username, email, or password".
3. The page links to `/register`.

`src/components/auth/mcq-stub.test.tsx`

1. Shows that multiple-choice quizzes are not built yet.
2. Does not show a question list or a create-question form.
3. Logout posts to `/api/auth/logout` and then navigates to `/login`.

`src/components/home-links.test.tsx`

1. Shows a Quiz Maker line and links to `/register` and `/login`.

**Implement**:

1. Add `/register`, `/login`, and `/mcq`, with the tested client components doing the work.
2. Point `/` at the home links component.
3. Wire each form to its endpoint and the success navigation in this PRD.

**Green**: `npm test` passes the full suite. Check the UI acceptance criteria. Then run `npm run lint`, `npm run build`, and the browser pass on `npm run preview`.

**Deliverables**:

- Register, login, logout, and the MCQ stub work in the browser.
- `npm test`, `npm run lint`, and `npm run build` succeed.

---

## Technical Implementation Details

### Key Files

- `wrangler.jsonc` — D1 binding `DB` for database `faid-quiz-maker`
- `migrations/0001_create-users.sql` — `users` table and unique indexes
- `src/lib/db.ts` — reads `env.DB` from `getCloudflareContext()`
- `src/lib/password.ts` — PBKDF2 hash and verify
- `src/lib/services/users.ts` — add, edit, delete, and login lookup
- `src/lib/validators/auth.ts` — Zod schemas for each request body
- `src/lib/http.ts` — validation and service error responses
- `src/app/api/auth/register/route.ts` — create account
- `src/app/api/auth/login/route.ts` — check password
- `src/app/api/auth/logout/route.ts` — acknowledge logout
- `src/app/api/users/[id]/route.ts` — edit and delete
- `src/app/register/page.tsx` — register page
- `src/app/login/page.tsx` — login page
- `src/app/mcq/page.tsx` — MCQ stub
- `src/components/auth/register-form.tsx` — register form
- `src/components/auth/login-form.tsx` — login form
- `src/components/auth/mcq-stub.tsx` — stub copy and logout
- `src/components/home-links.tsx` — links from `/` to register and login
- `vitest.config.ts` — Vitest, jsdom, and the `@/` alias
- `migrations/create-users.test.ts` — schema contract
- `src/lib/password.test.ts` — hash and verify
- `src/lib/validators/auth.test.ts` — request schemas
- `src/lib/services/users.test.ts` — create, update, delete, lookup
- `src/app/api/auth/register/route.test.ts` — register HTTP contract
- `src/app/api/auth/login/route.test.ts` — login HTTP contract
- `src/app/api/auth/logout/route.test.ts` — logout HTTP contract
- `src/app/api/users/[id]/route.test.ts` — edit and delete HTTP contract
- `src/components/auth/register-form.test.tsx` — register form
- `src/components/auth/login-form.test.tsx` — login form
- `src/components/auth/mcq-stub.test.tsx` — stub and logout
- `src/components/home-links.test.tsx` — home links

### Implementation Patterns

Route handlers stay thin. They parse JSON, validate, call the service, and translate errors.

```typescript
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function getDb() {
  const { env } = getCloudflareContext();
  return env.DB;
}
```

```typescript
const user = await db
  .prepare("SELECT id, username, email, password_hash FROM users WHERE username = ?1 OR email = ?1")
  .bind(identifier.toLowerCase())
  .all();

const row = user.results[0];
```

Hash on write. Compare with a constant-time check on login, update, and delete. Never log the password or the hash.

### Important Notes

- Zod, Vitest, and the testing libraries are installed. Do not add bcrypt, an auth framework, a session library, or `@cloudflare/vitest-pool-workers`.
- Write each phase's tests first. `npm test` must fail for those tests before production code is added, then pass after it. Green Vitest output and the checked acceptance criteria are both required.
- D1 is server-only. Database modules must not be imported into a client component.
- `npm run dev` runs on Node. Verify the register and login flow with `npm run preview` before calling the feature done, because D1 is a Workers binding.
- Do not deploy, and do not apply the migration remotely.
- Login success is not durable. The next request does not know which teacher signed in.
- Phase 1: `npm test` failed 5 tests before the migration and binding existed, then passed 5. The migration file is `migrations/0001_create-users.sql`. The `DB` binding is in `wrangler.jsonc`. Local D1 has the `users` table. Remote D1 has no migrations applied.
- Phase 2: the password, validator, and user-service suites failed to import before those modules existed. After implementation, `npm test` passed 22 tests. `createUser`, `updateUser`, and `deleteUser` write through `src/lib/services/users.ts`. `authenticateUser` checks a login password and returns a public user. Error codes are `duplicate`, `invalid_password`, `not_found`, and `invalid_credentials`. The password hash stays inside the service.
- Phase 3: the four route suites failed to import before the handlers existed. After implementation, `npm test` passed 35 tests. Register, login, logout, update, and delete map validation and `UserServiceError` codes to the status codes in this PRD. Login and logout set no cookie and return no token.

---

## Acceptance Criteria

- [x] A local migration creates `users` with primary key, first name, last name, username, email, password hash, and timestamps.
- [x] Username and email are unique, case-insensitive.
- [x] Register stores a PBKDF2 hash and returns the public user with no `password_hash`.
- [x] Register with a duplicate username or email returns 409 and does not create a second row.
- [x] Login with the correct username or email and password returns 200 and the public user.
- [x] Login with a wrong password or unknown account returns the same 401 message.
- [x] Register and login responses include no `Set-Cookie` header and no token.
- [x] Logout returns `{ "ok": true }` and writes nothing to `users`.
- [x] Update changes the allowed fields only when `currentPassword` matches, and can replace the hash when `newPassword` is present.
- [x] Delete removes the row only when `currentPassword` matches.
- [x] Update and delete return 404 for an unknown id and 401 for a wrong current password.
- [ ] `/register` and `/login` reject invalid fields before the request, including a confirm-password mismatch.
- [ ] Successful register and successful login both navigate to `/mcq`.
- [ ] `/mcq` shows the stub copy and no question UI. Logout returns the teacher to `/login`.
- [ ] `/` links to `/register` and `/login`.
- [x] `npm test` runs Vitest, and the full suite is green.
- [x] Phase 1 schema tests were red before the migration existed, and are green after it.
- [x] Phase 2 password, validator, and user-service tests were red before those modules existed, and are green after them.
- [x] Phase 3 route tests were red before the handlers existed, and are green after them.
- [ ] Phase 4 component tests were red before the forms and stub existed, and are green after them.
- [ ] `npm run lint` and `npm run build` succeed.
- [ ] The register, login, logout, and stub flow has been exercised in the browser against the Workers preview.

Vitest covers the behavior rows above. Three checks stay outside the unit suite: the migration was applied to local D1, lint and build succeed, and the preview was exercised in the browser.

---

## Success Metrics

| Metric | Target | How Measured |
| --- | --- | --- |
| Account creation | A new teacher can register and reach `/mcq` in one submit | Manual pass through `/register` |
| Return visit | A teacher with an existing account can log in and reach `/mcq` in one submit | Manual pass through `/login` |
| Credential storage | 0 plaintext passwords in `users` | Inspect `password_hash` after register; value starts with `pbkdf2_sha256$` |
| Duplicate accounts | 0 second rows for the same username or email | Repeat register returns 409 and the row count stays 1 |
| Session leakage | 0 session cookies or tokens on login and logout | Login and logout route tests assert no `Set-Cookie` and no token |
| Phase signal | Each phase red, then green | `npm test` before implementation fails the new tests; after implementation the suite passes |

---

## Dependencies

### External Dependencies

- Cloudflare D1 — stores `users`. Created locally and bound as `DB`.
- Web Crypto API — PBKDF2 password hashing on Workers. No third-party hash package.
- Zod — request validation. Installed.
- Vitest, `@vitejs/plugin-react`, `@testing-library/react`, `@testing-library/user-event`, `jsdom`, and `vite-tsconfig-paths` — unit tests. Installed.

### Internal Dependencies

- `@opennextjs/cloudflare` `getCloudflareContext()` — access to `env.DB`.
- shadcn/ui `button`, `card`, `field`, `input`, and `label` — register and login forms.
- `src/lib/services/users.ts` — the only module that writes `users`.

No environment variables are required for hashing or the local database. Do not add a session secret.

---

## Risks and Mitigation

### Technical Risks

- **Risk**: A Node-only hash library fails on the Workers runtime.
- **Mitigation**: Hash with Web Crypto PBKDF2 and verify the flow with `npm run preview`.

- **Risk**: Anonymous SQL placeholders or string-built queries fail locally or accept injection.
- **Mitigation**: Numbered placeholders only, inside the user service.

- **Risk**: Someone applies the migration to remote D1 during implementation.
- **Mitigation**: Local apply only. Remote apply stays a separate, explicit decision.

- **Risk**: Tests pass without proving the feature, or the suite is green only because the tests were written after the code.
- **Mitigation**: Each phase starts with a recorded red run. Assertions check status codes, response bodies, stored hashes, and visible UI. A test whose assertion cannot fail does not count.

### User Experience Risks

- **Risk**: Teachers expect to stay signed in, but this feature has no session. Refreshing `/mcq` does not show who they are, and the stub is public.
- **Mitigation**: Copy on `/mcq` stays a placeholder. Do not label the teacher as signed in. Session management is a later feature.

- **Risk**: Edit and delete are open to anyone who knows the user id and the current password, and there is no UI to explain that.
- **Mitigation**: Require `currentPassword` on both writes. Do not add a user-list endpoint. Revisit authorization when sessions exist.

---

## Troubleshooting Guide

### PBKDF2 salt fails the Next.js type check

**Problem**: `npm run build` fails in `src/lib/password.ts` with `Uint8Array<ArrayBufferLike>` not assignable to `BufferSource`.

**Cause**: `crypto.subtle.deriveBits` expects an `ArrayBuffer`-backed view. A plain `Uint8Array` parameter is typed as `ArrayBufferLike`.

**Solution**: Copy the password bytes and the salt into a new `Uint8Array` created from a fresh `ArrayBuffer` before calling `importKey` and `deriveBits`.

**Code Reference**: `src/lib/password.ts:49`

---

## Notes for AI Agents

When working with this PRD:

1. Start by reading the Problem and Hypothesis to understand intent.
2. Use Scope (In/Out/Cut) to determine boundaries. Do not build MCQ questions, social login, or session management.
3. The primary key is `users.id`. Do not add a cryptographic private-key column.
4. For each phase, write the tests listed in that phase, run `npm test`, and confirm red before writing production code. Mark the phase complete only when `npm test` is green and the related acceptance criteria pass.
5. Update phase status markers as work progresses.
6. Add implementation details under "Technical Implementation Details" as code is written.
7. Mark acceptance criteria as complete when features work. The Vitest rows and the manual rows both need to be checked.
8. Add troubleshooting entries when bugs are found and fixed.
9. Keep all sections current. Remove outdated information.
10. Use code references format: `filepath:line-number` when citing code.
11. Do not deploy. Do not run `wrangler d1 migrations apply` with `--remote`.
12. Do not add `@cloudflare/vitest-pool-workers`. Mock `@/lib/db` in unit tests.

---

## Current Status

**Last Updated**: October 9, 2026

**Current Phase**: Phase 3 - Endpoints

**Status**: COMPLETED

**Next Steps**: Phase 3 is committed on `feature/register-login-logout`. Phase 4 has not started.
