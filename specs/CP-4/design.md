# CP-4 design: role rules on every other table

Status: DRAFT for goldfish review. Scope: `specs/CP-4/spec.md` (locked by Nimish, 8 Nov 2026). Waits for CP-3, which
must be merged first; this design builds on `specs/CP-3/design.md` and does not repeat it.
(R) will mark a change forced by a review finding. "Open" marks a question the reviewers should attack.

## What exists, and what CP-3 will have left
- ~150 tables in `public` and `pii` (158 create-table statements across the migrations), each with `app_all using (true)`
  except the CP-3 tables. `tests/test_data_register.py` already requires every table with a `child_id` column (plus
  `child`, `capture`, `item_result`, reached through a paper) to be in a data-register entry; that is the one existing
  list of child data and the starting point, not the answer (tables without a `child_id` can still hold child data).
- CP-3 gives: the groups as rows, `access_table(schema, table, kind_code, key_column, key_type, owner_column)`, the
  helpers (`my_reach`, `my_class_ids`, `my_child_ids`, `signed_in_staff`), and a redefined `internal.apply_conventions()`
  that writes `engine_all` + `web_rule` for listed tables and leaves `app_all` on the rest.
- The anonymous sign-in path (CP-2: `rawSql`, no identity) reads `config` (the sign-in list with password hashes), and the
  login-attempt and error tables, as `app_web`. A rule that needs an identity would break sign-in the day the site
  switches to `app_web`.
- `app_web` writes only: insert on `read_correction`; update on `item_result`, `prescription`, `skill_set`, `config`
  (20261021090000), plus whatever later migrations granted (the builder lists them from `information_schema`).
- Views over child data skip the rules (they run with their owner's rights). ~30 views, 21 migrations.
- `pii.read_child` (CP-3 adds the rule). Security definer functions the site calls (`move_child`, `confirm_results`,
  `resolve_result`, `roll_order`) run as their owner and skip the rules by design; they are listed, not changed.

## Goal
Every table is in `access_table` as `child` or `school_wide`. No `child` table has a rule for `app_web` that allows
everyone. A table nobody classified is closed to `app_web` until someone does, and CI fails until they do. The engine is
unaffected.

## The list (items 1 and 4)
- Rows in `access_table`, inserted by the CP-4 migration: one per table, ~150. Two new columns by `alter table`:
  `kind` (`child` | `school_wide`, default `child` for the CP-3 rows) and `reason` (text; the check constraint
  requires it for `school_wide`, one line). A table's later migration adds its own row in the same file.
- Why migration rows and not `supabase/seed/*.json`: `apply_conventions()` needs the row when the table is created,
  inside the migration; seeds load after the migrations. Precedent: `people_vocabulary`.
- `kind` = `child` for: the data register's tables, every table with a `child_id` column, `capture`, `item_result`,
  `sheet_instance` and what hangs off it, `activity_observation`, `child_move`, `consent`. A test asserts the list is a
  superset of that derived set, so a table cannot be quietly called school-wide.
- `school_wide` (with its one-line reason) for: the registry, skills, curriculum, prompts, thresholds, vocabulary tables,
  plan and timetable, the access tables themselves, config, logs. (The builder writes the reasons; reviewers check them.)
- Item 4's check: a test in the engine suite compares `information_schema.tables` (public, pii) with `access_table` and
  names each unlisted table. It runs on every pull request's database (the main CI job's `bin/ci-postgres` database and
  the athena job's CP-20 throwaway one).

## The rule for `child` tables
`key_type` gets a fourth value, `parent`: the table is reached through one parent table's own rule
(`fk_col in (select id from parent)`, which applies the parent's policy), for `item_result` → `capture` →
`sheet_instance` → `child`. Otherwise the CP-3 key types (class, child, staff). The kind (`access_kind`) of each CP-4
table is an insert (`answers`, `evidence`, `papers`, ...), each reached by the same two groups; this adds rows to
`access_reach`, never code. Policies stay `for all` (the website writes `item_result` and `read_correction`).
Open: the chain of subplans on `item_result` (the largest table) must be measured on realistic volume before merge.

## The rule for `school_wide` tables
- Default: `web_read for select to app_web using ((select public.signed_in_staff()) is not null)` and, where `app_web`
  holds a write privilege, `web_write` for those commands with the same test. "Open to every signed-in staff member."
- Exception column `open_before_sign_in boolean` (default false) for the tables the anonymous sign-in path reads or writes
  (`config`'s sign-in entry, login-attempt and error tables): policy `using (true)`, reason says "read before anyone is
  signed in". These are school-wide by nature and say so in `reason`; item 2 only constrains child data.
- Known and not fixed here: `config` holds password hashes and is therefore open to `app_web` before sign-in. Moving
  sign-in behind a function that returns a yes/no is a separate scope. Named in `docs/notes/CP-4.md` and reported.

## The default flips (item 4's second half)
`internal.apply_conventions()` is redefined again: a table not in `access_table` gets `engine_all` and **no** policy for
`app_web`, so it reads as empty to the website and the migration's author sees it at once. The engine, `service_role`
and the owner are unaffected. `app_all` is no longer created anywhere.

## Views (a hole the scope's wording misses)
A view over a `child` table hands its owner's view of the data to any login with `select` on the view. The migration sets
`security_invoker = on` on every view that reads a `child` table (Postgres 15 and later; the builder confirms the live
version with `select version()` first). The test lists every view and asserts it is either security-invoker or reads
only `school_wide` tables. If the live Postgres is older than 15 this item stops the scope (`athena block`).

## The engine (item 6)
`engine_all` is `to app_engine using (true)`. The suite already runs as the owner, so "passes unchanged" cannot show a
policy problem. The builder therefore adds a test that runs the nightly rebuild (`engine graph`, Ring B) and one typed
form through its pipeline with `set session authorization app_engine`, and that must pass (not a locked proof; a
verifier question). Ring B is `truncate`d by the rebuild: truncate is not row-filtered, only privilege-checked.

## Decisions for Nimish
1. The database narrows by class only; the subject narrowing the website does today stays in the website (a subject
   educator's maths-only view is not yet the database's job). Recommended: say so now; add subjects to the database in a
   later scope if wanted.
2. Nothing new: switch-on waits for the same gate as CP-3.

## Mechanical decisions (recorded)
- One table of rows decides everything: no table is named in code.
- "One test per group, not per role": the test loops over every `child` table with three identities (an educator of the
  table's own class, an educator of another class, a person in `everything`) and the no-identity case.
- LIVE item 2: `pg_policies` joined to `access_table` where `kind = 'child'`; fail on any policy whose roles include
  `app_web`, `public`, `authenticated` or `anon` and whose test is `true` or empty. Prints counts and table names.

## Implementation list
- Create `supabase/migrations/<ts>_access_every_table.sql`: columns, ~150 rows, the redefined `apply_conventions()`,
  `security_invoker` on views, new kinds and reach rows.
- Create `packages/engine/tests/test_access_every_table.py`; `docs/notes/CP-4.md`; extend the CP-3 ADR or add one.
- Modify `packages/engine/engine/checks/rules.json` if constraints change; the map if `test_layout` names tables.
