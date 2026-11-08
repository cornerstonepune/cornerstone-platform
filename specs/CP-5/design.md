# CP-5 design: database hygiene

Status: REVISED after goldfish review (zoom-out, design, implementation-readiness, codebase-details). Scope: `specs/CP-5/spec.md`.
(R) marks a change forced by a review finding.

## Problem (verified)
- Supabase's advisor flags 35 functions with a mutable search path. About 100 existing function definitions already pin
  one, so the 35 are a minority. The list exists only in the live advisor; nothing in the repo names it (R).
- Convention in the repo: `set search_path = public` (about 40 migrations), `pii, public` for `pii` functions. No existing
  function uses `pg_catalog, public, internal` (R).
- The live project reference is in three tracked files, not one: `docs/superpowers/plans/2026-09-17-phase-0-foundations.md`
  (lines 7, 214, 215, 545, 748, 3368), `DECISIONS-LOG.md:43`, `STATE.md:57`. Five of seven occurrences are bare refs with
  no `.supabase.co` (R).
- No test checks function search paths. Two pg_proc scans exist: `test_db_privileges.py` `OURS` (public/pii/internal,
  owner = current_user, extensions excluded via `pg_depend deptype='e'`) and `test_roles.py::_functions` (public/pii only) (R).

## Goal
Every application function pins its search path; a test keeps it that way; the project reference leaves tracked files.

## Mechanical decisions (recorded)
1. The 35 names come from a LIVE read-only query run on the box or with the Supabase connector (functions in public, pii,
   internal, owner = our role, not extension-owned, `proconfig` has no `search_path`), with full signatures from
   `oid::regprocedure`. The list is committed in the migration, ordered, not discovered at run time. A function missing at
   apply time makes the migration fail loudly (it must not skip silently) (R).
2. Path values follow the existing convention, per function, not a new one (R): `public` for `public` and `internal`
   functions; `pii, public` for `pii` functions and for definers whose body reads `pii.*` unqualified. `internal` is added to
   a path ONLY where the body has an unqualified `internal` call (a body scan in the builder's notes lists these; none are
   known). Definers get the minimum. `pg_catalog` is always implicitly first; not repeated.
3. Body scan (R): before writing the migration the builder greps each of the 35 bodies for unqualified extension names
   (`extensions.`, `gen_random_uuid` is core), and records the result in `docs/notes/CP-5.md`.
4. Guard test: extend the existing `OURS` query in `test_db_privileges.py` with a `proconfig` check requiring a
   `search_path` entry that is non-empty and contains no `$user`; runs in CI where `TEST_DATABASE_URL` is set. In
   sandboxes without the variable it skips, as the neighbours do (R).
5. Item 5 (same results): no new standing before/after test. The proof is the engine's full existing suite passing unchanged
   (spec item 6) plus the body scan; each altered function is also called once in a rolled-back transaction in the
   builder's check run, noted in `docs/notes/CP-5.md` (R).
6. Project reference: scrub it from all three files and from any `.env.example`, replaced by the word `<project-ref>`. The
   check uses `git ls-files` with a fixed pattern for the 20-character ref taken from the env var
   `SUPABASE_PROJECT_REF` (already used in `engine/checks/live.py`); in CI it is required, locally it skips. The ref stays
   in git history; that is accepted, it is an identifier not a secret.
   CONFLICT: `STATE.md` is frozen by CLAUDE.md. Editing one line there needs Nimish's yes, or the scope says "all tracked
   files except STATE.md" (a user-visible trade-off, see below).
7. Item 3 (leaked-password protection): it is a Supabase Auth setting. The repo has its own password system (password_link,
   password_ask, sign_in_failure) and sign-in is the site's own, not Supabase Auth. The builder checks for any `auth.users`
   use. If unused, item 3 is replaced by a recorded decision "not applicable: Supabase Auth is not used". If used, the
   dashboard toggle is switched by Nimish and the proof reads the setting. Issue text to be amended before locking.

## Trade-off for Nimish (short)
1. STATE.md carries the project reference on one line and is frozen. Allow a one-line scrub, or leave it and accept "all
   tracked files except STATE.md"? Recommendation: allow the scrub.
2. Item 3: recommend replacing it with the recorded "not applicable" decision unless you want our own passwords checked
   against known-leaked lists, which is a bigger separate piece of work.

## Implementation list
- Create `supabase/migrations/<timestamp later than newest>_pin_function_search_paths.sql` (explicit list, 35 `alter function`).
- Modify `packages/engine/tests/test_db_privileges.py`: `proconfig` check.
- Create a repo check for the project reference (engine test over `git ls-files`).
- Modify the three docs above (and `.env.example` if it holds the ref).
- Create `docs/notes/CP-5.md`: the 35 names' source query, body-scan result, smoke-call result, item 3 finding.
- Rule 9 holds: the migration is the only DDL.
