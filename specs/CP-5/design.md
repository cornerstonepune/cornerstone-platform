# CP-5 design: database hygiene

Status: DRAFT for design review. Scope: `specs/CP-5/spec.md`.

## Problem
Supabase's advisor flags 35 functions with a mutable search path; leaked-password protection is off; the old plan doc
`docs/superpowers/plans/2026-09-17-phase-0-foundations.md` (line ~215) holds the live project reference. No test scans
function search paths today.

## Goal
Every application function pins its search path; a test keeps it that way; the project reference leaves tracked files.

## Decisions (mechanical)
- One new migration runs `alter function ... set search_path = ...` for each flagged function, listed explicitly (the 35
  come from the advisor/`pg_proc`, written into the migration, not found by a loop at run time). Reason: reviewable, and a
  migration must be deterministic.
- Path value: `pg_catalog, public` for public functions; `pg_catalog, public, internal` (and `pii` where the body reads it)
  for `internal` and `pii` functions. Reason: smallest set that keeps each body resolving; each body is read before the set.
- Guard test: query `pg_proc` joined to `pg_namespace` for application schemas, assert `proconfig` has a `search_path`
  entry; exclude extension-owned functions. Runs on the test database in CI.
- Before/after behaviour (item 5): a fixed table of sample calls on the test database, run before and after the migration.
- Leaked-password protection is a Supabase Auth dashboard setting, not SQL, and this site does not use Supabase Auth
  sign-in. Likely trade-off: it can only be switched in the dashboard (Nimish) and may need the Pro plan. Proposed default:
  Nimish switches it in the dashboard; the scope's proof reads the setting; if the plan blocks it, replace item 3 with a
  recorded decision before locking.
- The project reference: replace with a placeholder in the doc; add a repo test that greps tracked files for it. The
  reference itself must not be written into the test: the test reads it from an environment variable in CI, and checks the
  doc for the pattern `[a-z]{20}\.supabase\.co`.

## Implementation list
- `supabase/migrations/<next>_pin_function_search_paths.sql`
- `packages/engine/tests/test_function_search_path.py`
- `packages/engine/tests/test_function_behaviour_unchanged.py`
- `docs/superpowers/plans/2026-09-17-phase-0-foundations.md`: reference removed
- `docs/notes/CP-5.md`
