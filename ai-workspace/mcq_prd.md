Date created: October 13, 2026
Date last modified: October 13, 2026

# Multiple-Choice Questions (Create, Edit, Preview, Delete) - Technical PRD

## Overview/Problem

Teachers can register and log in, but `/mcq` is only a stub. Right now Quiz Maker cannot store a single question. This feature turns `/mcq` into a question bank. A teacher can create a multiple-choice question with 2 to 7 choices and mark one as correct. The teacher can also edit the question, preview it the way a student would see it, and delete it. Each answer submitted in preview is stored as an attempt, along with whether the chosen answer was correct. The question records which teacher created it, and the attempt records which teacher answered it.

Every primary key is a database id named `id`. Foreign keys are named `<table>_id`, except `mcq_questions.created_by`, which names the role (the teacher who wrote the question) and references `users.id`.

---

## Hypothesis

We believe a question table with one create/edit screen, a recorded creator, and a preview that records who answered will let a teacher write, check, and maintain a set of multiple-choice questions without leaving `/mcq`.

---

## Scope

### In Scope

- One local D1 migration that creates three tables: `mcq_questions`, `mcq_choices`, and `mcq_attempts`.
- `mcq_questions`: id, name, question text, description, `created_by` referencing `users.id`, and timestamps.
- `mcq_choices`: id, a foreign key to `mcq_questions`, the choice label, position, a correct flag, and timestamps. A question has at least 2 and at most 7 choices. Exactly one choice is correct.
- `mcq_attempts`: id, a foreign key to `mcq_questions`, a foreign key to `mcq_choices` for the choice that was selected, `user_id` referencing `users.id` for the teacher who answered, whether that choice was correct when it was selected, and a timestamp.
- Remembering the signed-in teacher in `sessionStorage` after register or login, and clearing that value on logout. Create and attempt send that teacher's id. The server checks that the id exists in `users` before it writes. This is not a session and not a credential.
- An MCQ service, `src/lib/services/mcq.ts`, used by every route and page that reads or writes questions and choices.
- An attempts service, `src/lib/services/attempts.ts`, used by every route and page that reads a question for answering or that records an attempt. This is the "answers" service.
- HTTP endpoints:
  - `POST /api/mcqs`
  - `PUT /api/mcqs/[id]`
  - `DELETE /api/mcqs/[id]`
  - `POST /api/mcqs/[id]/attempts`
- Pages:
  - `/mcq`: a table of questions, a "New question" button, and logout.
  - `/mcq/new`: the question editor in create mode.
  - `/mcq/[id]/edit`: the same editor, filled in with the saved question.
  - `/mcq/[id]/preview`: the question as a student sees it. Submitting an answer records an attempt and shows whether it was correct.
- Table columns: Name, Question, Description, Created by, and Actions. Created by shows the creator's first and last name. The Actions cell opens a menu with Edit, Preview, and Delete. Delete asks for confirmation first.
- The editor has Save and Cancel buttons. It starts with 2 empty choices, offers "Add choice" up to 7, and offers "Remove" down to 2.
- New shadcn components: `dropdown-menu`, `alert-dialog`, `textarea`, and `radio-group`.
- Vitest tests for every phase, written before the production code. Each phase starts red and is finished only when `npm test` is green for that phase.

### Out of Scope

- Restricting edit or delete to the creator. The creator is stored and shown, and every visitor still sees every question. Any visitor can still edit or delete, because there is no session to check against.
- A server session, cookie, or token. The browser remembers the teacher in `sessionStorage` after login. That value is not a credential, and a later request does not prove who sent it.
- Attempt history, statistics, or reports. Attempts are written, including who answered, but they are not listed.
- Quizzes (groups of questions), question ordering inside a quiz, and a student-facing quiz page.
- Questions with more than one correct answer, free-text answers, images, rich text, and Markdown.
- Search, filters, sorting controls, and pagination in the table. The table shows every question, newest first.
- Reordering choices by drag and drop. Choices keep the order they were entered in.
- Duplicating a question.
- Applying the new migration to remote D1 and deploying. Both need explicit human approval.
- `@cloudflare/vitest-pool-workers` and any unit test that opens a real D1 database, a real network, or the Workers runtime.

### Cut

- `GET /api/mcqs` and `GET /api/mcqs/[id]`: cut because the `/mcq`, edit, and preview pages are Server Components that call the service directly. Nothing outside the app consumes a JSON list. Add these endpoints when an external client needs them.
- Server Actions for the writes: cut to keep the same pattern as the auth feature. Client components send JSON to route handlers, and the route tests cover the HTTP contract.
- Soft delete: cut. Delete removes the question, its choices, and its attempts.
- An `ON DELETE RESTRICT` rule for choices that already have attempts: cut because it would stop a teacher from removing a choice that was ever answered. Removing a choice deletes its attempts. See Risks.
- Keeping a question after its creator's account is deleted: cut. `created_by` and `user_id` use `ON DELETE CASCADE`. Deleting a teacher removes the questions they created (and those questions' choices and attempts) and the attempts they made on other questions.

---

## Technical Requirements

### Database Schema

Database `faid-quiz-maker` is already bound as `DB`. Do not create a new database, and do not change the binding. `0001_create-users.sql` stays unchanged.

Create the migration and apply it locally only:

```bash
npx wrangler d1 migrations create faid-quiz-maker create-mcq-tables
npx wrangler d1 migrations apply faid-quiz-maker --local
```

Expected file: `migrations/0002_create-mcq-tables.sql`.

```sql
CREATE TABLE mcq_questions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  question TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_mcq_questions_created_at ON mcq_questions (created_at);
CREATE INDEX idx_mcq_questions_created_by ON mcq_questions (created_by);

CREATE TABLE mcq_choices (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  question_id TEXT NOT NULL REFERENCES mcq_questions (id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 7),
  is_correct INTEGER NOT NULL DEFAULT 0 CHECK (is_correct IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_mcq_choices_question_id ON mcq_choices (question_id, position);
CREATE UNIQUE INDEX idx_mcq_choices_one_correct ON mcq_choices (question_id) WHERE is_correct = 1;

CREATE TABLE mcq_attempts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  question_id TEXT NOT NULL REFERENCES mcq_questions (id) ON DELETE CASCADE,
  choice_id TEXT NOT NULL REFERENCES mcq_choices (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  is_correct INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_mcq_attempts_question_id ON mcq_attempts (question_id);
CREATE INDEX idx_mcq_attempts_choice_id ON mcq_attempts (choice_id);
CREATE INDEX idx_mcq_attempts_user_id ON mcq_attempts (user_id);
```

Rules the schema enforces, and rules it leaves to the service:

- The partial unique index `idx_mcq_choices_one_correct` allows at most one correct choice per question. Create and update both refuse to write unless exactly one choice is correct. A saved question always has one row with `is_correct = 1`.
- SQLite cannot enforce "between 2 and 7 rows per question" without triggers. The validator and the service enforce the count. `position BETWEEN 1 AND 7` is a backstop.
- `position` is not unique. If it were, renumbering choices during an edit could collide in the middle of a batch.
- `mcq_attempts.is_correct` stores the result at the moment of the attempt. If the teacher later changes which choice is correct, earlier attempts keep their original result.
- D1 enforces foreign keys, so `ON DELETE CASCADE` works without a `PRAGMA`. Deleting a question removes its choices and attempts. Removing a choice during an edit removes the attempts that selected it. Deleting a user removes the questions they created and the attempts they made.
- `created_by` is set on insert and is not changed by edit. `user_id` on an attempt is the teacher who submitted that answer.

Queries live in `src/lib/services/`. Use prepared statements with numbered placeholders (`?1`, `?2`) and read rows from `all().results`. Multi-statement writes use `db.batch([...])` so that they all succeed or all fail. D1 has no interactive transactions.

### Data Shapes

Question returned by the MCQ service and the API:

```json
{
  "id": "q1",
  "name": "Photosynthesis basics",
  "question": "Which gas do plants absorb during photosynthesis?",
  "description": "Grade 6 science, unit 3",
  "choices": [
    { "id": "c1", "label": "Oxygen", "position": 1, "isCorrect": false },
    { "id": "c2", "label": "Carbon dioxide", "position": 2, "isCorrect": true }
  ],
  "createdBy": {
    "id": "u1",
    "firstName": "Ada",
    "lastName": "Lovelace",
    "username": "ada"
  },
  "createdAt": "2026-10-13T12:00:00.000Z",
  "updatedAt": "2026-10-13T12:00:00.000Z"
}
```

Table row (`McqSummary`): the same object without `choices`, plus `choiceCount`. It still includes `createdBy`.

Question returned for answering (`AttemptableQuestion`): the same object, but each choice is only `{ id, label, position }`. The correct answer is not sent to the browser until an attempt has been submitted.

### Validation Rules

`src/lib/validators/mcq.ts` holds the Zod schemas. It imports nothing that runs only on the server, so the editor can use it for checks before submitting.

| Field | Rules |
| --- | --- |
| Name | Required, trimmed, 1–120 characters |
| Question | Required, trimmed, 1–1000 characters |
| Description | Optional, trimmed, 0–500 characters, stored as `''` when blank |
| Choices | Array of 2–7 items |
| Choice label | Required, trimmed, 1–200 characters |
| Choice labels | No two labels on the same question may match, ignoring case and leading or trailing spaces |
| Correct choice | Exactly one choice has `isCorrect: true` |
| Choice id (update only) | Optional. If present, it must be an existing choice of the same question |
| `userId` (create and attempt) | Required, non-empty string. The service checks that this id exists in `users`. Update does not accept `userId`, and edit does not change `created_by` |
| `choiceId` (attempt) | Required, non-empty string |

Error messages, so that tests and UI agree:

- Fewer than 2 choices: "Add at least 2 choices"
- More than 7 choices: "A question can have at most 7 choices"
- No correct choice, or more than one: "Mark exactly one choice as correct"
- Duplicate labels: "Choices must be different"
- Blank choice label: "Every choice needs text"

The existing `validationError` helper keys errors by `issue.path[0]`, so every choice problem appears under `fields.choices`. Keep that helper as it is. The editor shows `fields.choices` under the choice list.

### Service Layer

`src/lib/services/mcq.ts`:

| Function | Behavior |
| --- | --- |
| `listQuestions(): Promise<McqSummary[]>` | Every question, newest first (`created_at DESC, id`), each with its choice count and `createdBy` from a join to `users` |
| `getQuestion(id): Promise<McqQuestion \| null>` | One question with its choices ordered by `position`, plus `createdBy` |
| `createQuestion(input): Promise<McqQuestion>` | Looks up `input.userId` in `users` and throws `user_not_found` when it is missing, before any write. Refuses the write unless exactly one choice has `isCorrect: true`. Generates ids with `crypto.randomUUID()`. Inserts the question, with `created_by`, and its choices in one `db.batch`. Sets each `position` from the array order, starting at 1. Exactly one inserted choice has `is_correct = 1` |
| `updateQuestion(id, input): Promise<McqQuestion>` | See the update order below. Does not change `created_by` |
| `deleteQuestion(id): Promise<void>` | Deletes the question. The cascade removes its choices and attempts |

`McqServiceError` follows the pattern of `UserServiceError`:

| Code | Message | HTTP |
| --- | --- | --- |
| `not_found` | "Question not found" | 404 |
| `user_not_found` | "User not found" | 404 |
| `invalid_choice` | "Choice does not belong to this question" | 400 |

Update runs one `db.batch`, in this order:

1. Load the current question and choices. If the question is missing, throw `not_found`. If a submitted choice `id` is not one of this question's choices, throw `invalid_choice`. If the submitted choices do not contain exactly one correct choice, throw before any write. Nothing is written in any of these cases.
2. `UPDATE mcq_questions` with name, question, description, and `updated_at`.
3. `DELETE FROM mcq_choices WHERE id = ?1 AND question_id = ?2` once for each current choice that was not submitted.
4. `UPDATE mcq_choices SET is_correct = 0 WHERE question_id = ?1`. This clears the old answer first, so the one-correct index never sees two correct choices.
5. `UPDATE` each submitted choice that has an `id` with its label, position, and correct flag.
6. `INSERT` each submitted choice that has no `id`.

`src/lib/services/attempts.ts`:

| Function | Behavior |
| --- | --- |
| `getQuestionForAttempt(id): Promise<AttemptableQuestion \| null>` | The question and its choices, without `isCorrect`. Includes `createdBy` |
| `recordAttempt(questionId, choiceId, userId): Promise<AttemptResult>` | Throws `not_found` if the question is missing, `user_not_found` if `userId` is not in `users`, and `invalid_choice` if the choice belongs to another question. Nothing is inserted in those cases. Reads `is_correct` from the database row, never from the request. Inserts one `mcq_attempts` row with that `user_id` |

```ts
type AttemptResult = {
  attempt: {
    id: string;
    questionId: string;
    choiceId: string;
    userId: string;
    isCorrect: boolean;
    createdAt: string;
  };
  correctChoiceId: string;
};
```

Both services are server-only. They import `@/lib/db` and must never be imported into a `'use client'` component.

`src/lib/http.ts` `serviceError` is extended to accept `McqServiceError` as well as `UserServiceError`. Each error class keeps its own status mapping. Existing auth route tests must stay green.

### API Endpoints

Every route parses the body with `readJson`, validates it with Zod, calls the service, and turns service errors into responses with `serviceError`. Route handlers never call `getDb`.

#### POST /api/mcqs

Creates a question and its choices.

**Request Body:**

```json
{
  "name": "Photosynthesis basics",
  "question": "Which gas do plants absorb during photosynthesis?",
  "description": "Grade 6 science, unit 3",
  "userId": "u1",
  "choices": [
    { "label": "Oxygen", "isCorrect": false },
    { "label": "Carbon dioxide", "isCorrect": true }
  ]
}
```

**Response:**

- Success (201): `{ "question": <question> }`
- Error (400): `{ "error": "Validation failed", "fields": { "<field>": "<message>" } }`
- Error (404): `{ "error": "User not found" }`
- Error (500): `{ "error": "Unable to create question" }`

#### PUT /api/mcqs/[id]

Replaces the name, question, description, and the full set of choices. It does not change `created_by`. To keep a choice and the attempts that selected it, send its `id`. A saved choice that is left out is deleted. The body has no `userId`.

**Request Body:**

```json
{
  "name": "Photosynthesis basics",
  "question": "Which gas do plants absorb during photosynthesis?",
  "description": "",
  "choices": [
    { "id": "c1", "label": "Oxygen", "isCorrect": false },
    { "id": "c2", "label": "Carbon dioxide", "isCorrect": true },
    { "label": "Nitrogen", "isCorrect": false }
  ]
}
```

**Response:**

- Success (200): `{ "question": <question> }`
- Error (400): validation error, or `{ "error": "Choice does not belong to this question" }`
- Error (404): `{ "error": "Question not found" }`
- Error (500): `{ "error": "Unable to update question" }`

#### DELETE /api/mcqs/[id]

Deletes the question, its choices, and its attempts.

**Request Body:** empty

**Response:**

- Success (200): `{ "ok": true }`
- Error (404): `{ "error": "Question not found" }`
- Error (500): `{ "error": "Unable to delete question" }`

#### POST /api/mcqs/[id]/attempts

Records one attempt. The server decides whether it is correct.

**Request Body:**

```json
{ "choiceId": "c2", "userId": "u1" }
```

**Response:**

- Success (201): `{ "attempt": { "id": "a1", "questionId": "q1", "choiceId": "c2", "userId": "u1", "isCorrect": true, "createdAt": "..." }, "correctChoiceId": "c2" }`
- Error (400): validation error, or `{ "error": "Choice does not belong to this question" }`
- Error (404): `{ "error": "Question not found" }` or `{ "error": "User not found" }`
- Error (500): `{ "error": "Unable to record attempt" }`

### User Interface Requirements

Pages are thin Server Components. They load data through a service and pass plain objects to one client component. Pages that read D1 export `export const dynamic = "force-dynamic"` so that `next build` does not try to prerender them. Edit and preview call `notFound()` when the service returns `null`.

shadcn components used:

| Component | Status | Used for |
| --- | --- | --- |
| `table` | Installed | Question list |
| `button` | Installed | New question, Save, Cancel, Add choice, Remove, Submit, Logout |
| `card` | Installed | Editor and preview containers |
| `field` | Installed | `FieldSet`, `FieldGroup`, `Field`, `FieldLabel`, `FieldDescription`, `FieldError` in the editor |
| `input` | Installed | Name and choice labels |
| `badge` | Installed | Choice count in the table, "Correct" and "Incorrect" in preview |
| `dropdown-menu` | Add | Actions menu on each row |
| `alert-dialog` | Add | Delete confirmation |
| `textarea` | Add | Question and description |
| `radio-group` | Add | Marking the correct choice in the editor, picking an answer in preview |

Add them with:

```bash
npx shadcn@latest add @shadcn/dropdown-menu @shadcn/alert-dialog @shadcn/textarea @shadcn/radio-group
```

Each one must create a file in `src/components/ui/`. If the CLI wants to install a new npm package, stop and ask before accepting. All four are expected to use the already installed `@base-ui/react`. Do not hand-edit the generated files. Icons come from `lucide-react` (`Plus`, `MoreHorizontal`, `Pencil`, `Eye`, `Trash2`, `X`).

#### MCQ list (`/mcq`)

Page file: `src/app/mcq/page.tsx`. It calls `listQuestions()` and renders `McqList` from `@/components/mcq/mcq-list`.

- Heading: "Multiple-choice questions".
- A "New question" button that links to `/mcq/new`.
- A Logout button. It calls `POST /api/auth/logout`, clears the stored teacher, and then navigates to `/login`. Move it into `LogoutButton` at `@/components/auth/logout-button`.
- Table columns, in order: Name, Question, Description, Created by, Actions.
- Created by shows the creator's first and last name, for example "Ada Lovelace".
- Question and description cells truncate to one line. The full text is in the cell's `title`. An empty description shows "—" in `text-muted-foreground`.
- When there are no questions, a single row reads "No questions yet." with a link "Create your first question" to `/mcq/new`.
- The Actions cell is an icon button with accessible name "Actions for <name>". It opens a dropdown menu with:
  - Edit: navigates to `/mcq/<id>/edit`.
  - Preview: navigates to `/mcq/<id>/preview`.
  - Delete: shown with the destructive style. It opens the delete confirmation.
- The delete confirmation:
  - Title: "Delete this question?"
  - Description: "This removes "<name>", its choices, and every recorded attempt. This cannot be undone."
  - Buttons: Cancel (closes the dialog, no request) and Delete (calls `DELETE /api/mcqs/<id>`).
  - While the request is in flight, Delete is disabled. On 200, the dialog closes and the page calls `router.refresh()`. On failure, the dialog stays open and shows the API error.

#### Question editor (`/mcq/new` and `/mcq/[id]/edit`)

Page files: `src/app/mcq/new/page.tsx` and `src/app/mcq/[id]/edit/page.tsx`. Both render `McqEditor` from `@/components/mcq/mcq-editor`. The edit page passes `initialQuestion`.

- Card title: "New question" in create mode, "Edit question" in edit mode.
- Fields, in order:
  - Name (`Input`)
  - Question (`Textarea`)
  - Description (`Textarea`, labeled "Description (optional)")
  - Choices
- The Choices `FieldSet` has the legend "Choices" and the description "Add 2 to 7 choices and mark the correct one."
- Each choice row has:
  - a radio item with accessible name "Choice N is correct"
  - an input labeled "Choice N"
  - a Remove button with accessible name "Remove choice N"
- The radio items form one `RadioGroup`. One choice is always marked correct. The group does not allow clearing the selection.
- Create mode starts with 2 empty choices. Choice 1 is marked correct.
- "Add choice" appends an empty row that is not correct. It is disabled at 7 choices. Remove is disabled at 2 choices. Removing the choice that is marked correct marks the first remaining choice correct, so Save still has exactly one correct choice.
- In edit mode, each choice row keeps its saved `id`, and that `id` is sent back on save. New rows have no `id`. The PUT body does not include `userId`, and the creator shown on the question does not change.
- Save (`type="submit"`):
  - Runs the shared Zod schema first. If it fails, it shows each message with `FieldError` and sends no request. The body always includes exactly one choice with `isCorrect: true`. Save does not send a question that has zero correct choices or more than one.
  - Create mode sends `POST /api/mcqs` with `userId` set to the stored teacher's id. Edit mode sends `PUT /api/mcqs/<id>`.
  - Save is disabled and labeled "Saving…" while the request is in flight.
  - On success, it navigates to `/mcq` and calls `router.refresh()`.
  - On 400 with `fields`, it shows the messages next to their fields. On any other error, it shows the API `error` above the buttons.
- Cancel (`type="button"`) navigates to `/mcq` and sends no request.
- Create mode with no stored teacher does not show the form. It shows "Log in to create a question" and a link to `/login`. Edit mode does not need a stored teacher, because it does not change `created_by`.

#### Question preview (`/mcq/[id]/preview`)

Page file: `src/app/mcq/[id]/preview/page.tsx`. It calls `getQuestionForAttempt(id)` and renders `McqPreview` from `@/components/mcq/mcq-preview`.

- Card title: the question name. Below it, the description, if there is one.
- The question text, then a `RadioGroup` with one item per choice, labeled with the choice label, in `position` order.
- "Submit answer" is disabled until a choice is picked. It sends `POST /api/mcqs/<id>/attempts` with `{ choiceId, userId }`, where `userId` is the stored teacher. The body does not include `isCorrect`.
- With no stored teacher, the question and choices still render, and the submit button is replaced by "Log in to answer this question" linking to `/login`. No attempt is sent.
- On 201:
  - Show a `Badge` reading "Correct" or "Incorrect".
  - Mark the choice whose id is `correctChoiceId` with "Correct answer".
  - Lock the radio group and show "Try again". Try again clears the selection and the result. The next submit records a new attempt.
- On failure, show the API error and leave the selection in place.
- Links: "Edit question" to `/mcq/<id>/edit` and "Back to questions" to `/mcq`.

#### Current teacher

There is still no server session. Register and login already return the public user and then navigate to `/mcq`, and that response is the only moment the browser learns who signed in. This feature keeps that user in the tab so create and attempt can name them.

`src/lib/current-user.ts` is safe to import from client components. It does not import `@/lib/db` or either service. It reads and writes `sessionStorage` under the key `quiz-maker.user`.

```ts
type StoredUser = {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
};
```

- `saveCurrentUser(user)` stores that object. `SignupForm` calls it on 201, and `LoginForm` calls it on 200, before navigating to `/mcq`.
- `readCurrentUser()` returns the object, or `null` when the key is missing or the JSON is not that shape.
- `clearCurrentUser()` removes the key. `LogoutButton` calls it when logout is clicked, before the request returns.
- `sessionStorage` lasts for the tab. A new tab does not have the teacher, and neither does a browser that never logged in. Those visitors can read `/mcq` and open preview, and they are sent to `/login` before creating a question or submitting an answer.
- The stored id is not proof of identity. The server only checks that the id exists in `users`. Do not add a cookie, a token, or a session table in this feature.

---

## Test-Driven Development

Vitest and Testing Library are already installed and configured (`vitest.config.ts`, `npm test`). The rules from the auth feature still apply.

1. Write the phase's tests first. Run `npm test`. Record the red run. A test that never failed proves nothing.
2. Implement only enough to make those tests pass.
3. Run `npm test` again. Green, together with the acceptance criteria that cite those tests, means the phase is done.
4. Keep earlier phases and the existing auth suites green. Do not weaken an assertion to make a suite pass.

Test rules:

- Put each test next to the file it tests: `src/lib/services/mcq.ts` is tested by `src/lib/services/mcq.test.ts`.
- Assert what can be observed: return values, thrown error codes, SQL text and bound parameters, the order of statements inside `db.batch`, HTTP status and body, and what a user can see or do.
- Cover the failure paths in the same file: validation, a missing question, a choice from another question, and a service failure.
- Each test must pass when run alone. Reset mocks in `beforeEach` with `vi.clearAllMocks()`, and reset the fake database rows there too.
- Service tests mock `@/lib/db`. Extend the in-memory fake from `src/lib/services/users.test.ts` with `batch(statements)`. The fake applies the statements in order and fails the whole batch if any statement fails, as D1 does. The fake also enforces the one-correct rule and the cascades, so that the service tests catch a wrong statement order.
- Route tests mock `@/lib/services/mcq` and `@/lib/services/attempts`. They never reach the fake database.
- Component tests mock `fetch` and `next/navigation` (`useRouter` with `push` and `refresh`). Query by role and accessible name, and drive input with `@testing-library/user-event`.
- Server Component pages are not rendered with Testing Library. They stay thin, and the client components they render are tested instead.
- Base UI menus, dialogs, and radio groups render into portals. Use `findByRole` after opening them. If jsdom is missing a browser API that Base UI needs (for example `PointerEvent` or `ResizeObserver`), add a minimal polyfill in a `vitest.setup.ts` file referenced from `vitest.config.ts`. Record that in the Troubleshooting Guide. Do not switch the test environment or add a dependency without asking.

---

## Implementation Phases

### Phase 1: Database - COMPLETED

**Objective**: Questions, choices, and attempts can be stored in local D1, and tests guard the schema.

**Red**: Add `migrations/create-mcq-tables.test.ts`. It reads the single `*create-mcq-tables*.sql` file under `migrations/` and fails while that file is missing.

1. `mcq_questions` has `id`, `name`, `question`, `description`, `created_by`, `created_at`, and `updated_at`. `id` is the primary key. `created_by` is `NOT NULL` and references `users (id) ON DELETE CASCADE`.
2. `mcq_choices` has `id`, `question_id`, `label`, `position`, `is_correct`, `created_at`, and `updated_at`. `question_id` references `mcq_questions (id) ON DELETE CASCADE`.
3. `mcq_choices.is_correct` is limited to 0 and 1, and `position` is limited to 1 through 7.
4. `idx_mcq_choices_one_correct` is a unique index on `mcq_choices (question_id)` with `WHERE is_correct = 1`.
5. `mcq_attempts` has `id`, `question_id`, `choice_id`, `user_id`, `is_correct`, and `created_at`. `question_id` references `mcq_questions (id)` and `choice_id` references `mcq_choices (id)`, both with `ON DELETE CASCADE`. `user_id` is `NOT NULL` and references `users (id) ON DELETE CASCADE`.
6. Indexes exist on `mcq_questions (created_by)`, `mcq_choices (question_id, position)`, `mcq_attempts (question_id)`, `mcq_attempts (choice_id)`, and `mcq_attempts (user_id)`.
7. `migrations/0001_create-users.sql` is unchanged. `migrations/create-users.test.ts` stays green.

**Implement**:

1. `npx wrangler d1 migrations create faid-quiz-maker create-mcq-tables`.
2. Write the SQL above.
3. `npx wrangler d1 migrations apply faid-quiz-maker --local`.

**Green**: On October 13, 2026, `npm test` failed 6 schema tests before `migrations/0002_create-mcq-tables.sql` existed (49 existing tests passed, including `migrations/create-users.test.ts`). After the migration was added, `npm test` passed 55 tests. Local apply of `0002_create-mcq-tables.sql` succeeded and executed 11 commands. Local D1 lists `mcq_questions`, `mcq_choices`, and `mcq_attempts` alongside `users`. Remote D1 was not changed.

**Deliverables**:

- `migrations/0002_create-mcq-tables.sql`
- `migrations/create-mcq-tables.test.ts`
- The three tables exist in local D1

### Phase 2: Validators and services - COMPLETED

**Objective**: Every read and write of questions, choices, and attempts goes through `mcq.ts` or `attempts.ts`, as shown by tests against a fake database.

**Red**: Add the tests below before the modules exist. Run `npm test` and confirm they fail.

`src/lib/validators/mcq.test.ts`

1. Create accepts a valid question with 2 choices and with 7 choices.
2. Create rejects a blank name, a blank question, a name longer than 120 characters, and a description longer than 500 characters.
3. Create rejects 1 choice ("Add at least 2 choices") and 8 choices ("A question can have at most 7 choices").
4. Create rejects zero correct choices and two correct choices ("Mark exactly one choice as correct").
5. Create rejects a blank choice label ("Every choice needs text") and duplicate labels that differ only in case or spaces ("Choices must be different").
6. A missing description is turned into `''`. Labels are trimmed.
7. Update accepts an optional choice `id`. Create drops or rejects a choice `id`; pick one behavior and test it. Update rejects a `userId` field, or ignores it; pick one behavior and test it. Create requires a non-empty `userId`.
8. Attempt requires a non-empty `choiceId` and a non-empty `userId`.

`src/lib/services/mcq.test.ts` mocks `@/lib/db`.

1. `createQuestion` makes one `db.batch` call with one question insert and one choice insert per choice. The question insert binds `created_by` to the given user id. Positions are 1..N in the submitted order. Exactly one stored choice has `is_correct = 1`. The returned question has the choices in order and `createdBy` for that user. A call with zero correct choices or two correct choices throws before `db.batch`, and the fake holds no new rows.
2. `createQuestion` stores a blank description as `''`.
3. If the batch fails, `createQuestion` throws and the fake holds no partial rows.
4. `createQuestion` throws `user_not_found` when the user id is missing from `users`, and it writes nothing.
5. `listQuestions` returns the newest first, with `choiceCount` and `createdBy`, and without `choices`.
6. `getQuestion` returns choices ordered by `position` and `createdBy`, and returns `null` for an unknown id.
7. `updateQuestion` changes the question fields and `updated_at`, keeps `created_by`, keeps the ids of submitted choices, inserts new choices, and deletes the ones left out.
8. `updateQuestion` can move the correct answer from one existing choice to another without breaking the one-correct rule. This proves that the clear step runs before the set step.
9. `updateQuestion` throws `not_found` for an unknown question and `invalid_choice` for a choice id from another question. It also throws before any write when the new choices have zero correct choices or two correct choices. None of these write anything.
10. `deleteQuestion` removes the question, its choices, and its attempts. It throws `not_found` for an unknown id.
11. Every statement uses numbered placeholders. No submitted value appears in the SQL text.

`src/lib/services/attempts.test.ts` mocks `@/lib/db`.

1. `getQuestionForAttempt` returns choices in order with no `isCorrect` key, includes `createdBy`, and returns `null` for an unknown id.
2. `recordAttempt` with the correct choice stores `is_correct = 1` and `user_id`, and returns `isCorrect: true`, `userId`, and `correctChoiceId`.
3. `recordAttempt` with a wrong choice stores `is_correct = 0` and returns `isCorrect: false` with the real `correctChoiceId`.
4. `recordAttempt` throws `not_found` for an unknown question, `user_not_found` for an unknown user, and `invalid_choice` for a choice that belongs to another question. None of those inserts a row.

**Implement**:

1. `src/lib/validators/mcq.ts` with `createMcqSchema`, `updateMcqSchema`, and `createAttemptSchema`, plus their inferred types.
2. `src/lib/services/mcq.ts` with `McqServiceError`, the row-to-object mappers, and the five functions.
3. `src/lib/services/attempts.ts` with `getQuestionForAttempt` and `recordAttempt`.

**Green**: On October 13, 2026, `npm test` failed to load the validator, MCQ service, and attempts suites because those modules did not exist (55 existing tests passed). After the modules were added, `npm test` passed 79 tests, including the auth suites. `npm run lint` and `npm run build` passed.

**Deliverables**:

- One validator module shared by the server and the editor
- One service per area, and no direct `getDb` call outside `src/lib/services/`

### Phase 3: Endpoints - COMPLETED

**Objective**: Create, update, delete, and record-attempt follow the HTTP contracts above, as shown by route tests with the services mocked.

**Red**: Add the tests below. Mock `@/lib/services/mcq` and `@/lib/services/attempts`. Confirm they fail.

`src/app/api/mcqs/route.test.ts`

1. A valid body returns 201 and `{ question }`, and passes the parsed input, including `userId`, to `createQuestion`.
2. An invalid body (bad JSON, too few choices, no correct choice, missing `userId`) returns 400 with `fields`, and does not call the service.
3. `user_not_found` returns 404 with "User not found".
4. A service failure returns 500 with "Unable to create question".

`src/app/api/mcqs/[id]/route.test.ts`

1. PUT with a valid body returns 200 and `{ question }`, and passes the route `id` to `updateQuestion`.
2. PUT returns 400 for validation, 400 for `invalid_choice`, 404 for `not_found`, and 500 with "Unable to update question".
3. DELETE returns 200 and `{ ok: true }`.
4. DELETE returns 404 for `not_found` and 500 with "Unable to delete question".

`src/app/api/mcqs/[id]/attempts/route.test.ts`

1. A valid `choiceId` and `userId` return 201 with `attempt` (including `userId`) and `correctChoiceId`.
2. A missing `choiceId` or a missing `userId` returns 400 and does not call the service.
3. `invalid_choice` returns 400, `not_found` and `user_not_found` return 404, and other failures return 500 with "Unable to record attempt".
4. An `isCorrect` field in the request body is ignored. The route passes the question id, `choiceId`, and `userId` to `recordAttempt`.

`src/lib/http.test.ts`

1. `serviceError` maps `McqServiceError` `not_found` and `user_not_found` to 404 and `invalid_choice` to 400, keeps the `UserServiceError` mapping, and returns the fallback with 500 for any other error.

**Implement**:

1. Extend `serviceError` in `src/lib/http.ts`.
2. Add `src/app/api/mcqs/route.ts` (`POST`), `src/app/api/mcqs/[id]/route.ts` (`PUT`, `DELETE`), and `src/app/api/mcqs/[id]/attempts/route.ts` (`POST`). Use `params: Promise<{ id: string }>`, as in `src/app/api/users/[id]/route.ts`.

**Green**: On October 13, 2026, `npm test` failed to load the three route suites because the handlers did not exist, and `serviceError` returned 500 for a missing question (79 existing tests passed). After the handlers and error mapping were added, `npm test` passed 92 tests, including the auth route tests. `npm run lint` and `npm run build` passed.

**Deliverables**:

- Four endpoints that match the contracts above

### Phase 4: Question list - COMPLETED

**Objective**: `/mcq` shows the question table, including who created each question, with Edit, Preview, and Delete actions. Register and login remember the teacher, and logout forgets them.

**Red**: Add the shadcn components first, so that a red run means a failed assertion and not a missing import. Then add the tests and confirm they fail.

`src/lib/current-user.test.ts`

1. `saveCurrentUser` then `readCurrentUser` returns the same id, first name, last name, and username.
2. `readCurrentUser` returns `null` when nothing is stored and when the stored value is not that shape.
3. `clearCurrentUser` makes the next read return `null`.

Add to `src/components/signup-form.test.tsx` and `src/components/login-form.test.tsx`:

1. A successful register or login stores the returned user with `saveCurrentUser` before navigating to `/mcq`.
2. A failed register or login does not store a user.

`src/components/auth/logout-button.test.tsx` (moved from `mcq-stub.test.tsx`)

1. Clicking Logout clears the stored teacher, sends `POST /api/auth/logout`, and then navigates to `/login`.
2. The button is disabled while the request is in flight.

`src/components/mcq/mcq-list.test.tsx`

1. Shows a row per question with its name, question text, description, and creator's first and last name, in the order given.
2. Shows "—" for an empty description.
3. Shows "No questions yet." and a link to `/mcq/new` when the list is empty.
4. "New question" links to `/mcq/new`.
5. Opening "Actions for <name>" shows Edit, Preview, and Delete. Edit and Preview go to `/mcq/<id>/edit` and `/mcq/<id>/preview`.
6. Delete opens "Delete this question?" with the question name in the description. Cancel closes it without calling `fetch`.
7. Confirming Delete sends `DELETE /api/mcqs/<id>`, closes the dialog, and calls `router.refresh()`.
8. A failed delete keeps the dialog open and shows the API error.
9. Logout is on the page.

**Implement**:

1. `npx shadcn@latest add @shadcn/dropdown-menu @shadcn/alert-dialog @shadcn/textarea @shadcn/radio-group`.
2. Move the logout logic into `src/components/auth/logout-button.tsx`. Delete `src/components/auth/mcq-stub.tsx` and `mcq-stub.test.tsx`. The stub test that asserted "no question list" no longer describes the product.
3. Add `src/lib/current-user.ts`. Call it from `SignupForm`, `LoginForm`, and `LogoutButton`.
4. Add `src/components/mcq/mcq-list.tsx`.
5. Change `src/app/mcq/page.tsx` to load `listQuestions()` and render `McqList`, with `dynamic = "force-dynamic"`.

**Green**: On October 13, 2026, `npm test` failed to load `current-user`, `logout-button`, and `mcq-list` because those files did not exist, and the new login and signup assertions failed because nothing was stored before navigation (94 existing tests passed). After the list, storage, and logout were added, `npm test` passed 105 tests. `npm run lint` and `npm run build` passed, and `/mcq` is dynamic. On `npm run dev` at `http://localhost:3000`, the table showed a question created by Ada Lovelace, Cancel left it in place, Confirm removed the question, its choices, and left the empty state. Register and login stored the teacher before `/mcq`, and Logout cleared that store and returned to `/login`.

**Deliverables**:

- Four new shadcn components under `src/components/ui/`
- `/mcq` lists questions and who created them, and Delete works from the table
- Register and login store the teacher, and logout clears that store

### Phase 5: Question editor - COMPLETED

**Objective**: A teacher can create a question at `/mcq/new` and edit it at `/mcq/[id]/edit`, with Save and Cancel.

**Red**: Add `src/components/mcq/mcq-editor.test.tsx` and confirm it fails.

1. Create mode, with a stored teacher, shows "New question", empty Name, Question, and Description fields, and 2 empty choice rows. Choice 1 is marked correct.
2. Create mode with no stored teacher shows "Log in to create a question" and a link to `/login`, and does not show Save or call `fetch`.
3. "Add choice" adds rows up to 7 and is then disabled. "Remove choice N" is disabled at 2 rows.
4. Only one choice can be marked correct at a time. Marking a different choice clears the previous one. Removing the correct choice marks the first remaining choice correct.
5. Saving with a blank choice or duplicate choices shows the matching message and does not call `fetch`.
6. A valid create sends `POST /api/mcqs` with name, question, description, the stored `userId`, and choices in order, and no choice ids. Exactly one choice in that body has `isCorrect: true`. On 201 it navigates to `/mcq` and calls `router.refresh()`.
7. Save is disabled and labeled "Saving…" while the request is in flight.
8. A 400 response with `fields.name` shows that message next to Name. A 500 response shows the API error.
9. Edit mode shows "Edit question" and the saved values. It keeps each choice's `id` in the PUT body and leaves `id` off a newly added row. It sends `PUT /api/mcqs/<id>` with no `userId`.
10. Cancel navigates to `/mcq` and does not call `fetch`, in both modes.

**Implement**:

1. `src/components/mcq/mcq-editor.tsx`, using `createMcqSchema` or `updateMcqSchema` from `@/lib/validators/mcq` for the check before submitting.
2. `src/app/mcq/new/page.tsx`.
3. `src/app/mcq/[id]/edit/page.tsx`, which loads `getQuestion(id)` and calls `notFound()` when it returns `null`.

**Green**: On October 13, 2026, `npm test` failed to load `mcq-editor` because the component did not exist (105 existing tests passed). After the editor and the create and edit pages were added, `npm test` passed 115 tests. `npm run lint` and `npm run build` passed. `/mcq/new` is static and `/mcq/[id]/edit` is dynamic. On `npm run dev` at `http://localhost:3000`, a logged-out visit to `/mcq/new` showed the login link. With a stored teacher, Save created a 3-choice question and returned to the list with that teacher in Created by. Edit loaded the saved values, Cancel returned without a request, and Save added a fourth choice, moved the correct answer, and left `created_by` unchanged. An unknown edit id returned 404.

**Deliverables**:

- Create and edit work end to end against local D1 under `npm run preview`

### Phase 6: Preview, attempts, and verification - PLANNED

**Objective**: A teacher can answer a question in preview, each submit is stored as an attempt, and the whole feature passes on the Workers preview.

**Red**: Add `src/components/mcq/mcq-preview.test.tsx` and confirm it fails.

1. Shows the name, description, question, and one radio item per choice in order.
2. With a stored teacher, "Submit answer" is disabled until a choice is picked.
3. Submitting sends `POST /api/mcqs/<id>/attempts` with `{ choiceId, userId }` and no `isCorrect`.
4. With no stored teacher, the question still renders, "Log in to answer this question" links to `/login`, and no request is sent.
5. On a correct result, it shows "Correct". On an incorrect result, it shows "Incorrect" and marks the `correctChoiceId` choice as "Correct answer".
6. After a result, the radio group is locked. "Try again" clears the selection and the result.
7. A failed request shows the API error and keeps the selection.
8. Links to `/mcq/<id>/edit` and `/mcq`.

**Implement**:

1. `src/components/mcq/mcq-preview.tsx`.
2. `src/app/mcq/[id]/preview/page.tsx`, which loads `getQuestionForAttempt(id)` and calls `notFound()` when it returns `null`.

**Green**: `npm test` passes through Phase 6. Then:

1. `npm run lint` and `npm run build` succeed.
2. On `npm run preview` (`http://localhost:3000`), walk through these steps in the browser:
   1. Register or log in, then create a question with 3 choices.
   2. See it in the table, with the creator's name in Created by.
   3. Edit it to add a fourth choice and change the correct answer. Confirm `created_by` is unchanged.
   4. Preview it and submit one correct and one incorrect answer.
   5. Confirm two rows in `mcq_attempts`, each with that teacher's `user_id`, with `npx wrangler d1 execute faid-quiz-maker --local --command "SELECT user_id, choice_id, is_correct FROM mcq_attempts"`.
   6. Delete the question.
   7. Confirm that its choices and attempts are gone.
3. Record the actual results in Technical Implementation Details.

**Deliverables**:

- The full create, list, edit, preview, attempt, and delete flow works on the local Workers preview

---

## Technical Implementation Details

### Key Files

- `migrations/0002_create-mcq-tables.sql`: questions, choices, and attempts tables and indexes. Applied locally on October 13, 2026. Not applied remotely.
- `src/lib/validators/mcq.ts`: Zod schemas for create, update, and attempt, safe to import in the browser
- `src/lib/current-user.ts`: read, save, and clear the teacher in `sessionStorage`
- `src/lib/services/mcq.ts`: list, get, create, update, and delete questions and choices, and record `created_by`
- `src/lib/services/attempts.ts`: load a question without answers, and record an attempt with `user_id`
- `src/lib/http.ts`: `serviceError` maps both `UserServiceError` and `McqServiceError`
- `src/app/api/mcqs/route.ts`: create
- `src/app/api/mcqs/[id]/route.ts`: update and delete
- `src/app/api/mcqs/[id]/attempts/route.ts`: record an attempt
- `src/app/mcq/page.tsx`: list page
- `src/app/mcq/new/page.tsx`: create page
- `src/app/mcq/[id]/edit/page.tsx`: edit page
- `src/app/mcq/[id]/preview/page.tsx`: preview page
- `src/components/mcq/mcq-list.tsx`: table, actions menu, and delete dialog
- `src/components/mcq/mcq-editor.tsx`: create and edit form
- `src/components/mcq/mcq-preview.tsx`: answer and result
- `src/components/auth/logout-button.tsx`: logout, moved out of the removed stub

### Implementation Patterns

Atomic create with ids generated in the service:

```typescript
const correctCount = input.choices.filter((choice) => choice.isCorrect).length;
if (correctCount !== 1) {
  throw new Error("Mark exactly one choice as correct");
}

const db = await getDb();
const questionId = crypto.randomUUID();
const statements = [
  db
    .prepare(
      "INSERT INTO mcq_questions (id, name, question, description, created_by) VALUES (?1, ?2, ?3, ?4, ?5)",
    )
    .bind(questionId, input.name, input.question, input.description, input.userId),
  ...input.choices.map((choice, index) =>
    db
      .prepare(
        "INSERT INTO mcq_choices (id, question_id, label, position, is_correct) VALUES (?1, ?2, ?3, ?4, ?5)",
      )
      .bind(crypto.randomUUID(), questionId, choice.label, index + 1, choice.isCorrect ? 1 : 0),
  ),
];
await db.batch(statements);
```

The server decides correctness:

```typescript
const result = await db
  .prepare("SELECT id, is_correct FROM mcq_choices WHERE id = ?1 AND question_id = ?2")
  .bind(choiceId, questionId)
  .all<{ id: string; is_correct: number }>();
const choice = result.results[0];
if (!choice) throw new McqServiceError("invalid_choice");
```

Thin page:

```tsx
import { McqList } from "@/components/mcq/mcq-list";
import { listQuestions } from "@/lib/services/mcq";

export const dynamic = "force-dynamic";

export default async function McqPage() {
  const questions = await listQuestions();
  return <McqList questions={questions} />;
}
```

### Important Notes

- No new npm dependencies are expected. If the shadcn CLI asks to install a package, stop and ask.
- D1 is reachable only from server code. `mcq.ts` and `attempts.ts` must never be imported from a `'use client'` file. Client components receive plain objects as props and send writes through `fetch`.
- `npm run dev` runs on Node with emulated bindings. Verify the flow with `npm run preview` before calling the feature done.
- D1 stores booleans as `0` and `1`. Convert them in the row mappers, and never send `0` or `1` to the client.
- `created_by` and `user_id` are required. Do not insert a question or an attempt without a user id that exists in `users`.
- The stored teacher is client state. Do not treat `sessionStorage` as authentication, and do not add a cookie or a session table while building this feature.
- Do not apply `0002_create-mcq-tables.sql` to remote D1 and do not deploy without explicit approval. Production currently has only `0001_create-users.sql`, so deploying this code before the remote migration would break `/mcq` in production.

---

## Acceptance Criteria

- [x] A local migration creates `mcq_questions`, `mcq_choices`, and `mcq_attempts` with the columns, foreign keys, checks, and indexes above. `created_by` and `user_id` both reference `users (id)` with `ON DELETE CASCADE`.
- [x] A question cannot be saved with fewer than 2 or more than 7 choices, without exactly one correct choice, with a blank choice, or with duplicate choices. This holds in the editor and at the API.
- [x] Creating a question writes the question, its `created_by`, and all its choices in one batch. A missing user returns 404 and leaves no rows. A failure leaves no partial rows.
- [x] `/mcq` lists every question, newest first, with Name, Question, Description, Created by, and Actions columns.
- [x] The Actions menu on each row offers Edit, Preview, and Delete.
- [x] "New question" opens `/mcq/new`. With a stored teacher, Save creates the question for that teacher and returns to `/mcq`. Without a stored teacher, the page links to `/login` and does not save. Cancel returns to `/mcq` without saving.
- [x] Edit loads the saved values. Save updates the question, keeps `created_by`, keeps the ids of unchanged choices, adds new choices, removes the ones that were dropped, and can change the correct answer.
- [ ] An unknown id on edit or preview shows the Next.js 404 page. An unknown id on the API returns 404 "Question not found".
- [x] Delete asks for confirmation. Confirming removes the question, its choices, and its attempts, then refreshes the table. Cancel changes nothing.
- [ ] Preview does not send which choice is correct before an attempt is submitted.
- [ ] Submitting an answer in preview inserts one `mcq_attempts` row with the selected `choice_id`, the stored teacher's `user_id`, and the correct flag decided by the server, and shows Correct or Incorrect.
- [x] A choice id from another question is rejected with 400 on update and on attempt.
- [x] Register and login store the teacher. Logout clears that store and returns to `/login`.
- [ ] Every phase's tests were red before the code existed and green after it. The full `npm test` suite, including auth, is green. Phases 1–4 are recorded. Phases 5 and 6 are still planned.
- [x] `npm run lint` and `npm run build` succeed.
- [ ] The full flow has been exercised in the browser on `npm run preview`, and the attempt rows were checked in local D1.

---

## Success Metrics

| Metric | Target | How Measured |
| --- | --- | --- |
| Time to author a question | Under 2 minutes for a 4-choice question | Manual run from "New question" to the row appearing in the table |
| Invalid questions stored | 0 questions with fewer than 2 or more than 7 choices, or without exactly one correct choice | `SELECT question_id, COUNT(*), SUM(is_correct) FROM mcq_choices GROUP BY question_id` in local D1 |
| Attempt integrity | Every preview submit creates exactly one attempt with that teacher's `user_id` and a correct flag decided by the server | Attempts route and service tests, plus the local D1 check in Phase 6 |
| Recorded creator | Every question row has a `created_by` that exists in `users`, and edit does not change it | Service tests, plus the Created by column in the Phase 6 browser pass |
| Orphaned rows after delete | 0 choices or attempts left for a deleted question | Service test, plus the local D1 check in Phase 6 |
| Phase signal | Each phase red, then green | Recorded `npm test` runs per phase |

---

## Dependencies

### External Dependencies

- Cloudflare D1 (`faid-quiz-maker`, binding `DB`): stores the three new tables. Local only until the remote migration is approved.

### Internal Dependencies

- `src/lib/db.ts`: `getDb()` for both services.
- `src/lib/current-user.ts`: the teacher remembered in the browser after login.
- `users` table: `created_by` and `user_id` reference `users.id`. Register and login are how a teacher id gets into the browser.
- `src/lib/http.ts`: `readJson`, `validationError`, and the extended `serviceError`.
- Zod (installed): request and form validation.
- Vitest, Testing Library, `user-event`, and jsdom (installed): every test in this PRD.
- shadcn/ui: `table`, `button`, `card`, `field`, `input`, and `badge` (installed); `dropdown-menu`, `alert-dialog`, `textarea`, and `radio-group` (added in Phase 4).
- `lucide-react` (installed): action and editor icons.

No environment variables are needed.

---

## Risks and Mitigation

### Technical Risks

- **Risk**: An update fails partway and leaves a question with the wrong choices or two correct answers.
- **Mitigation**: Every multi-statement write is one `db.batch`. The partial unique index rejects a second correct choice. The update clears `is_correct` before setting it again, and the service test for moving the correct answer proves that order.

- **Risk**: The fake database in service tests passes when real D1 would fail, for example because it does not enforce the cascade or the partial index.
- **Mitigation**: The fake enforces the one-correct rule, the cascades, and all-or-nothing batches. The Phase 6 manual check runs the same flow against local D1.

- **Risk**: The pages that read D1 are prerendered at build time and fail, or show stale data.
- **Mitigation**: `export const dynamic = "force-dynamic"` on those pages. Writes call `router.refresh()`.

- **Risk**: Base UI menus, dialogs, or radio groups do not behave in jsdom.
- **Mitigation**: Use `findByRole` after opening. Add the smallest polyfill needed in `vitest.setup.ts` and record it in the Troubleshooting Guide. Do not change the test environment or add a dependency without asking.

- **Risk**: The code is deployed before the remote migration, and production `/mcq` fails because the tables are missing.
- **Mitigation**: Release requires an approved remote migration first. Deployment is not part of this PRD.

### User Experience Risks

- **Risk**: Anyone can see, edit, or delete any question. The creator is stored and shown, but there is no session, so the app cannot limit those actions to that teacher.
- **Mitigation**: Keep edit and delete open, and do not describe the list as "my questions". Revisit authorization when sessions exist.

- **Risk**: The browser sends `userId`, so a person can change the stored id and have a question or an attempt recorded under another teacher who exists in `users`.
- **Mitigation**: The server checks that the id exists and nothing more. Do not describe this as sign-in. A real binding of the request to the teacher waits for sessions.

- **Risk**: A teacher removes a choice during an edit and silently loses the attempts that selected it.
- **Mitigation**: The Choices description and the Remove button stay simple for now. Note this behavior here, and revisit it, for example with a warning, once attempts are shown anywhere.

- **Risk**: Deleting a teacher account deletes every question they created and every attempt they made.
- **Mitigation**: `ON DELETE CASCADE` is the chosen rule. There is still no account-settings screen that calls delete. Call this out again if that screen is added.

- **Risk**: Preview attempts made by the teacher mix with future student attempts.
- **Mitigation**: There is no student flow yet. The attempt already stores which teacher answered. When a student flow is added, either add an attempt source column or stop recording preview attempts.

---

## Troubleshooting Guide

- **October 13, 2026 — shadcn CLI and `cn`**: `npx shadcn@latest add` stopped to ask whether to overwrite `button.tsx`. Answer no. It still installs the `cn` package and writes `import { cn } from "cn"` in new files, while the rest of this repo imports `cn` from `@/lib/utils`. Uninstall `cn` and change only that import in the new files. Do not overwrite `button.tsx`.
- **October 13, 2026 — "New question" role**: Rendering the create control with `Button`'s `render` prop sets `role="button"` on the anchor, so it is no longer a link. Use `Link` with `buttonVariants()` so the control stays a link to `/mcq/new`.

---

## Notes for AI Agents

When working with this PRD:

1. Read the Problem and Hypothesis first.
2. Respect Scope. Record `created_by` and `user_id`. Do not add sessions, cookies, quizzes, statistics, multi-answer questions, or GET list endpoints, and do not restrict edit or delete to the creator.
3. Ids are database primary keys named `id`. Foreign keys are `question_id`, `choice_id`, `user_id`, and `created_by`.
4. For each phase, write the listed tests, run `npm test`, and confirm they fail before writing production code. Mark the phase complete only when `npm test` is green and the related acceptance criteria pass.
5. All D1 access goes through `src/lib/services/mcq.ts` or `src/lib/services/attempts.ts`. Route handlers and pages call those services, never `getDb`.
6. Correctness of an attempt is decided on the server from `mcq_choices.is_correct`. Never trust a correctness value from the client. The attempt's `userId` must be a real `users.id`, and it is still not proof of who sent the request.
7. Apply migrations locally only. Do not run `migrations apply --remote` and do not run `npm run deploy` without explicit approval.
8. Ask before adding any npm package, including one that the shadcn CLI proposes.
9. Update phase status markers, Technical Implementation Details, and acceptance checkboxes as work lands. Record actual `npm test`, lint, build, and preview results, not expected ones.
10. Add troubleshooting entries when bugs are found and fixed.
11. Use `filepath:line-number` when citing code.

---

## Current Status

**Last Updated**: October 13, 2026

**Current Phase**: Phase 5 - Question editor

**Status**: COMPLETED

**Next Steps**:

1. Planning decisions, confirmed October 13, 2026:
   - one correct choice per question
   - preview records attempts
   - each question stores `created_by`, and each attempt stores `user_id`
   - the browser remembers the teacher in `sessionStorage`; there is still no server session
   - edit and delete stay open to any visitor
   - removing a choice deletes its attempts
   - deleting a user deletes their questions and attempts
2. Work happens on branch `mcq-crud`.
3. Phase 1 is complete. `0002_create-mcq-tables.sql` is applied on local D1 only.
4. Phase 2 is complete. `npm test` passed 79 tests after the services existed.
5. Phase 3 is complete. Route tests were red before the handlers existed, then `npm test` passed 92 tests.
6. Phase 4 is complete. List tests were red before the page existed, then `npm test` passed 105 tests. `/mcq` lists questions and deletes them after confirmation. Register and login store the teacher; logout clears that store.
7. Phase 5 is complete. The editor suite was red before the component existed, then `npm test` passed 115 tests. Create and edit work on the dev server against local D1.
8. Start Phase 6 after review: preview, attempts, and the full browser pass on `npm run preview`. Do not start it until asked.
