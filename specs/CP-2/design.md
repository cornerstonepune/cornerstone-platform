# CP-2 design: a request says who is asking

Status: DRAFT for design review. Scope: `specs/CP-2/spec.md`. Background: teacher-os `blueprint/people-and-access.md` §2.

## Problem
The website's database layer (`apps/web/lib/db.ts`) uses one postgres.js pool through Supabase's transaction pooler
(port 6543) with `max_pipeline: 0`, `prepare: false`, and no `sql.begin` (ADR 0024: stacked queries hung). The signed-in
person is known only in the website (cookie `cs_staff`, HMAC-signed, `lib/session-cookie.ts`). The database never learns
who is asking, so no per-person rule can exist. A value set on a pooled connection outside a transaction leaks to the
next person who gets that connection.

## Goal
Every website query carries the verified person's staff id into Postgres as a transaction-local value, readable by
`internal.current_staff()`, which returns nothing when unset. Nothing else changes.

## Options (from the source document)
- (a) Send the identity and the query as one message so Postgres runs them as one transaction.
- (b) Long-lived server in session mode (depends on the undecided host move).
- (c) Read child data via Supabase's Data API with a short-lived signed token.
Rejected already: `with`-clause trick (no ordering guarantee), moving sign-in to Supabase Auth.

## Recommendation: (a) first, (c) as fallback
Reason: (a) touches one file and keeps every existing query; (c) rewrites the site's queries; (b) waits on a host decision.
Mechanism to try, in this order, each proved on the real pooler (item 4 of the scope) before the next is tried:
1. `sql.begin` with `max_pipeline: 0` retried against the current pooler: the original hang may not reproduce with
   pipelining already off. Inside it: `select set_config('app.staff_id', $1, true)` then the query.
2. One simple-protocol message `begin; select set_config(...); <query>; commit` via `sql.unsafe`. Only for statements with
   no bound parameters; the identity is a validated integer or uuid formatted by code, never a free string.
If neither holds 200 alternations, choose (c) and say so in the decision record.

## Technical plan
- New `internal.current_staff()` (SQL, stable): reads `current_setting('app.staff_id', true)`, returns null if empty or
  not a valid id. A migration adds it; no rule calls it yet.
- `apps/web/lib/db.ts`: one exported helper wraps the person's queries so identity is set inside the same transaction.
  Identity comes only from `currentStaff()` (verified cookie), never from a header, query or body.
- Pages that run with no signed-in person (sign-in page, health) use the plain pool and see no identity.
- Test: a database test (CI/box, real pooler) alternates A, B, none ≥200 times and asserts each request sees only its
  own identity. Direct Postgres is blocked from agent sandboxes, so this proof runs in CI or on the box (`check_box`).

## Decision needed from Nimish?
None unless (c) is chosen: then the cost (rewriting site queries) is a user-visible schedule trade-off.

## Out of scope
Rules, grid, Supabase Auth, screens.

## Implementation list
- `supabase/migrations/<next>_current_staff.sql`: `internal.current_staff()`; grant execute to `app_web`, `app_engine`.
- `apps/web/lib/db.ts`: identity-carrying helper; keep `sql` export for anonymous use.
- `apps/web/lib/auth.ts`: no change except exporting the verified staff id source (if not already).
- `docs/adr/00NN-who-is-asking.md`: the decision record (item 1), options rejected with reasons.
- `packages/engine/tests/test_current_staff.py` and a web test: fail-closed, single source of identity, alternation.
- `docs/notes/CP-2.md`: branch note.
