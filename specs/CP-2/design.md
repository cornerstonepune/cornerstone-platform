# CP-2 design: a request says who is asking

Status: REVISED after goldfish review (zoom-out, design, implementation-readiness, codebase-details). Scope: `specs/CP-2/spec.md`.
Background: teacher-os `blueprint/people-and-access.md` section 2. Review findings are folded in; each change is marked (R).

## Problem
`apps/web/lib/db.ts` has one postgres.js pool on Supabase's transaction pooler (port 6543), `max_pipeline: 0`,
`prepare: false`. The driver refuses `sql.begin` in that mode (UNSAFE_TRANSACTION, comment at db.ts:22-28). ADR 0024
records the earlier hang when queries were stacked (pipelined); it does not itself mention `sql.begin` (R). 66 files
in `apps/web` import `sql` (R), so any design that makes each call site change is a rewrite. The signed-in person is
known only inside the website: cookie `cs_staff` (HMAC, `lib/session-cookie.ts`) -> `currentStaff()` (`lib/auth.ts`,
React `cache`) -> `staffList()` which itself queries through `sql` (a bootstrap loop, R).

## Goal
Every website query made for a signed-in person carries that person's staff id (uuid) into Postgres as a
transaction-local value, readable by `current_staff()`, which returns null when unset or malformed. CP-2 proves the
identity TRANSPORT only. It does not claim "fail closed" for data: no rule calls the function until CP-3, and the site
connects as an owner-class login that skips row rules until the app-role login step is done. That dependency is stated
in CP-3, not hidden here (R).

## Mechanical decisions (recorded)
1. Function lives in `public`, not `internal` (R): `app_web` and `app_engine` have no USAGE on `internal`
   (docs/notes/m0-05-people-enrolment.md), the precedent `public.staff_of_email` sits in `public` for that reason.
   Spec item 2 names `internal.current_staff()`: the issue text must be amended to `public.current_staff()` before locking.
   `security invoker`, `revoke ... from public`, execute to `app_web`, `app_engine`.
2. Identity type is uuid only (R). `current_staff()` casts `nullif(btrim(current_setting('app.staff_id', true)), '')`
   to uuid and returns null on empty or on a cast failure (never raises). The setting key is `app.staff_id`,
   set with `set_config('app.staff_id', value, true)` (transaction-local); never the session-local form. Same pattern as
   `app.changed_by` in 20261224090000 (R).
3. The identity is formatted into SQL only after a uuid regex check in one function; dev bypass (`id` undefined) and any
   failure mean NO identity, the query runs anonymous. Never the string "undefined" (R).
4. Layering (R): `db.ts` exports two things. `rawSql` is the anonymous pool, for the sign-in path, `staffList`,
   health checks, and scripts; an allow-list test fails any new import of `rawSql`. `sql` keeps its name and tagged-template
   shape so the 66 call sites do not change; it resolves identity through a resolver that `auth.ts` registers at load
   (no import cycle), and `staffList()` moves to `rawSql`.
5. Keep the existing `deadline()` wrapper; the transaction timeout is the same budget (R).

## The trade-off: how the identity and the query travel together
The original text said "try sql.begin again". That cannot work as written (driver refusal, not a hang). The honest
state: option (a) is unproven. A spike decides, on the real pooler, run by CI or on the box (direct Postgres is blocked
from agent sandboxes). Candidates in order, extending `apps/web/scripts/check-pooler.ts` (the existing real-pooler
harness):
- A1. `sql.reserve()` then awaited, non-pipelined `begin`, `select set_config(..., true)`, the query, `commit`/`rollback`
  in `finally`. BEGIN pins one backend until COMMIT under transaction pooling; nothing is stacked. Unverified; this is
  what the spike tests first.
- A2. A second pool with pipelining allowed, used only for identity-carrying queries, with `sql.begin`. Risks the ADR 0024
  hang; the spike must show it does not.
- A3. One simple-protocol message `begin; set_config; query; commit` via `sql.unsafe`. REJECTED for general use: parameterised
  queries cannot be sent this way and hand-formatted values are an injection path (R). Not built.
- C. Supabase Data API with a signed token: the fallback if A1 and A2 both fail. This rewrites the site's queries.
If the spike falls to C, that is a user-visible schedule trade-off and goes to Nimish; otherwise no decision is his.

## Proofs (what the builder must write)
- The decision record (`docs/adr/`, next free number checked at build time, filename states the choice) is written FIRST
  as "chosen, pending proof", then amended with the spike's result (R: ordering).
- Spike/alternation test, web-side, extends `check-pooler.ts`, runs only with an env var holding the pooler URL
  (`CHECK_POOLER_URL`; skips with a clear message when unset, fails in CI where it is required). It runs with the pool
  at `max: 1` and records `pg_backend_pid()` to show A and B really shared one backend, then: A,B,none alternation x200;
  concurrent A and B; a request whose query errors mid-transaction, then a request that must see no identity; a request
  whose `deadline()` fires, then the same check; a rolled-back request (R).
- Unit tests: `current_staff()` null cases (unset, empty, garbage), no identity under dev bypass, uuid regex.
- Single source of identity (spec item 3): a static test fails if `set_config` or `app.staff_id` appears in `apps/web`
  outside `lib/db.ts`, and if `rawSql` is imported outside the allow-list (R).
- Spec item 5: existing Playwright and speed suites run unchanged; the transaction adds round trips, so the speed suite
  is a real gate, not a formality.
- Spec item 6, LIVE: `check_box` read-only proof that the policy count and definitions are unchanged.

## Implementation list
- Create `supabase/migrations/<timestamp later than the newest file>_current_staff.sql`: `public.current_staff()`.
- Modify `apps/web/lib/db.ts`: `rawSql`, identity-carrying `sql`, resolver hook, uuid check.
- Modify `apps/web/lib/auth.ts`: register the resolver; `staffList()` uses `rawSql`. (Not "no change".)
- Modify `apps/web/lib/queries.ts` and any sign-in path files that must stay anonymous: switch to `rawSql`.
- Modify `apps/web/scripts/check-pooler.ts`: the spike and the alternation proof.
- Create `apps/web/tests/` unit and static-scan tests (Playwright/vitest convention already in use there).
- Create `packages/engine/tests/test_current_staff.py` (needs `TEST_DATABASE_URL`; CI has it, agent sandboxes do not).
- Create `docs/adr/<n>-who-is-asking.md` and `docs/notes/CP-2.md`.
- No other DDL. Rule 9 holds.
