# CP-4 design: role rules on every other table

Status: REVISED after goldfish review (zoom-out, design, implementation-readiness, codebase-details; reports in
`specs/CP-4/design-review/`). Scope: `specs/CP-4/spec.md` (locked by Nimish, 8 Nov 2026). Builds on `specs/CP-3/design.md`
and waits for CP-3 to be merged. (R) marks a change forced by a review finding.

## What exists (verified in the repository)
- ~155 base tables in `public` and `pii` (158 create-table statements, 3 later dropped; the builder derives the number).
  Each has `app_all using (true)` except the CP-3 tables. Replaying the old migrations on a fresh database re-creates
  `app_all` everywhere, so the new `apply_conventions()` must drop it (R).
- CP-3 gives: the groups and reach as rows, `access_table`, the helpers (`signed_in_staff`, `my_reach`, `my_class_ids`,
  `my_child_ids`), and `apply_conventions()` writing `engine_all` + `web_rule` for listed tables.
- **The browser suite in CI already runs the website as `app_web`** (`ci.yml` sets `TEST_WEB_DATABASE_URL`;
  `playwright.config.ts` starts the site on it). So item 5 is a real gate, not a formality (R, corrects the first draft):
  every table the pages read must give the CI test user what they read. CP-3 makes that user a person in the
  `everything` group; CP-4 keeps it so.
- Every view already has `security_invoker = true` (30 statements, 21 migrations). No view hole exists (R, corrects the
  first draft). Kept: one guard test.
- Child data held in tables with no `child_id` (R): `capture` (via `sheet_instance_id`, nullable), `item_result` (via
  `capture_id`), `narrative_observation`, `gold`, `page_choice`, `capture_page` (via `capture_id`), `mistake_named` (via
  `item_result_id`), `class_card` (child ids inside arrays, keyed by `section` text), `sheet_template` (no child: a paper
  blueprint). `sheet_instance.child_id` is null until a coordinator names the paper.
- The anonymous sign-in path (before anyone is signed in) reads or writes, as `app_web`: `config` (read; password set
  updates it), `sign_in_failure` (read, insert), `threshold` (read), `tenant` (read), `password_ask` (read, insert),
  `password_link` (read, insert, update), `web_error` (insert). Source: `apps/web/lib/auth.ts`, `password*.ts`,
  `web-errors.ts`. A rule needing an identity there would switch brute-force protection off silently (R).
- `app_web` table and column writes are listed in `test_roles.py` `WEB_WRITES` (the maintained list); security-definer
  functions the site calls are `WEB_CALLS` there. Both are cited, not re-derived (R).

## Threat model (stated so nobody over-reads these rules) (R)
The rules are a backstop against a mistake in the website (a page that forgets a filter, an id that leaks) and a
guarantee for "no identity means no child data". They do not stop someone who holds the `app_web` password: that person
can claim any identity. Protecting the password and moving sign-in behind a definer function are separate.

## Goal
Every table is in `access_table` as `child_data` or `school_wide`. No `child_data` table has a rule for `app_web` that
allows everyone. An unlisted table cannot be created without failing loudly. The engine is unaffected.

## The list (items 1 and 4)
- `access_table` gains `data_class` (`child_data` | `school_wide`; named to avoid `kind_code`, R) and `reason` (text).
  Constraints: `kind_code`, `key_column`, `key_type` are all set iff `child_data`; `reason` is non-blank, one line, iff
  `school_wide`. The three CP-3 staff rows are `child_data` with kind `staff` (explicit, not a default, R).
- Rows are inserted by the CP-4 migration (precedent: `people_vocabulary`; `apply_conventions` needs the row when the
  table is created, and seeds load later). A later table adds its row in its own migration.
- **Phase 1 produces the full table** (R, readiness blocker): a script run on a database built from the migrations lists
  every base table with its proposed class, key and reason, applying these rules in order:
  1. a `child_id` column: `child_data`, key `child`, kind from the data-register entry that names the table, else `answers`
     if it hangs off a paper, else `learning`;
  2. a `class_id` or `school_class_id` column: `child_data`, key `class`;
  3. `capture_id` / `item_result_id` / `sheet_instance_id` column: `child_data`, key `capture` / `item_result` / `sheet`
     (below);
  4. `section` text column naming a class: see "Section-keyed tables";
  5. everything else: `school_wide` with a one-line reason.
  Exemptions, explicit and reasoned: `sheet_template` (`school_wide`: a blueprint of a paper, no child; it is in the
  register's "papers" entry), `school_class`, `campus`, `academic_year`, `role`, `access_*` (`school_wide`: structure).
  The output goes to `docs/notes/CP-4.md` and is read by the verifier before phase 2. The migration's inserts are
  generated from it, so list and migration cannot drift.
- Item 4's test: `pg_class` `relkind in ('r','p')` in `public`, `pii` against `access_table`, both directions (a row
  naming a table that does not exist fails too). In addition `apply_conventions()` **raises**, naming the table, when it
  finds a base table with no row (R): a new table fails in the migration, in CI, the moment it is written. Old migrations
  ran the old definition and are unaffected.
- Test that the derived set (data-register tables, tables with `child_id`, the capture/result family, and the six
  tables above) is a subset of `child_data` apart from the exemptions, so a table cannot be quietly called school-wide.
  The six tables are added to `data_register.json` (table lists only; parents' words unchanged).

## The rule for `child_data` tables
Kinds are the data-register codes: `name`, `class`, `papers`, `answers`, `learning`, `observations`, `reports`,
`who_looked`, `consent` (R, reuse). Reach rows: `everything` all; `own_classes` `own` for every kind except `who_looked`
and `consent`, which the register says the coordinator alone sees: `own_classes` none (R). Added by insert; the
vocabulary function is redefined for new schools and existing schools are backfilled in the same migration (R).
Key types (a fixed set; each is one expression in the generator, no free SQL in a row):
- `class`, `child`, `staff` as CP-3.
- `sheet`, `capture`, `item_result`: CP-3's `public.my_ids(kind, key_type)` gains these three key types (CP-4 redefines it).
  `sheet` = sheets of the person's children plus sheets they uploaded (`uploaded_by`), as `staff_sees_sheet` does;
  `capture` = captures of those sheets plus ones they uploaded, so an unmatched scan stays visible to its uploader;
  `item_result` = results of those captures. The generated test is `col = any ((select public.my_ids(K, T))::uuid[])`, as for the
  CP-3 types. One definer helper per hop replaces nested parent subplans: the meaning sits in one place and is evaluated
  once per statement (R).
- Where a key is null the row is visible to `everything` and, if it carries an uploader, to that person; otherwise only
  to `everything`. Stated, not hidden.
- A child who moves class takes the history out of the old class's view (reach is by open enrolment); a child who has
  left is visible to `everything` only. This matches today's habit of reading by present class; it is a decision for
  Nimish below.
Gate (R): on a database seeded to realistic size (the builder states the volume from the live counts), a representative
page query on `item_result` as `app_web` with an `own` identity under `explain (analyze)` must run within the figure the
builder records beforehand; if it does not, add a trigger-kept `child_id` to `capture` and `item_result` (the fallback)
and say so in the notes. Indexes on `capture.sheet_instance_id` and `sheet_instance.child_id` are confirmed first.

### Section-keyed tables
`class_card` and any table keyed by legacy `section` text have no class id and (for `class_card`) hold child ids in arrays.
Rule: if `section` equals a `school_class` section/grade pair in the data, key it as `class` through `school_class`;
if the mapping cannot be stated from the data, phase 1 stops (`athena block`) and asks, because guessing here either
blanks the class page or shows every class to every educator. Today only K2-A has class rows, so this table is the
largest switch-on risk and is named in the switch-on gate.

## The rule for `school_wide` tables (R: changed after review)
`web_all for all to app_web using (true) with check (true)`: today's behaviour under a name that is not `app_all`.
The scope says "open to every signed-in staff member"; making that a database test would need the exact list of tables
read before sign-in (seven, above) and would switch brute-force protection off silently if one were missed. So school-wide
tables stay open to the website login, as now. Narrowing them to signed-in people needs sign-in moved behind a definer
function; proposed as its own scope. Not a regression: nothing is opened that is not already open. Item 2 constrains
child data only. Known and named in `docs/notes/CP-4.md`: `config` holds the sign-in list's password hashes and is
readable and updatable by the website login; `password_link` token hashes likewise.

## The default (item 4's second half, reworded)
Once every table is listed, `apply_conventions()` has no `app_all` branch: it drops `app_all` everywhere, creates
`engine_all`, and `web_rule` or `web_all`. It keeps `service_role_all`, the `touch_updated_at` trigger, the ledger revoke
loop and the `app_engine` existence guard verbatim (add `app_web` to the guard) (R). Test: no policy named `app_all`
exists; no table has a permissive policy for `app_web` other than `web_rule`/`web_all`.

## Existing tests this changes (R)
`packages/engine/tests/test_roles.py:171-181` asserts `app_all` on every table; it is rewritten to assert `engine_all`
for `app_engine` and `web_rule` or `web_all` for `app_web`. Item 6 says the suite passes "unchanged": this one assertion
cannot, because it asserts what the scope removes. It is the same check in new words and no check is weakened. Told to
Nimish. New helpers are added to `WEB_CALLS`. `rules.json`: regenerate with `engine live rules --write` on a fresh test
database.

## The engine (item 6) (R)
The suite runs as the owner, so "passes unchanged" cannot show a policy problem. The proof of "unaffected" is direct: a
test that every base table has a permissive `engine_all` policy `to app_engine` for all commands with `using` and `check`
true, and that `app_engine`'s table privileges are identical before and after the migration (snapshot compared). The
rebuild (Ring B) writes through security-definer functions, and `app_engine` has no TRUNCATE anywhere; neither changes.
Running the jobs under `app_engine` would first fail on that missing privilege for reasons not CP-4's, so it is not part
of this scope (named in the notes).

## Known gaps, named not fixed (R)
`pii.read_child(id, actor)` returns any child's name for any id. CP-3 leaves it (a test of "is this the engine" would blank
names for both services while they use the owner login). After this scope an id is reachable only through rows a person
may see, so the gap is small; the fix is a test applied only when `session_user = 'app_web'`, proposed as a follow-up.
Security-definer functions the site calls (`resolve_result`, `confirm_results`, `move_child`, `say_taught`) run as their
owner and take a child or result id: an educator of class X could write to class Y through them. The rules here govern
reads and direct writes. A guard on those functions is proposed as a follow-up scope, to Nimish.

## Decisions for Nimish
1. School-wide tables stay open to the website login (the scope said "signed-in staff"): narrowing needs sign-in moved
   behind a function first.
2. A child's history leaves the old class's view when they move; children who left are visible to the "everything" group
   only.
3. One existing test assertion (`app_all` on every table) is rewritten, with the same strength.
4. The class page may go blank for educators at switch-on until sections are classes (the CP-3 gate); the three
   functions above need a follow-up.
(Subject narrowing: as CP-3, it stays with the website.)

## Phases
1. Script, `docs/notes/CP-4.md` table, verifier reads it. Stop rule for section-keyed tables.
2. Migration: columns, constraints, kinds and reach, helpers, rows, `apply_conventions()` (last), `select
   internal.apply_conventions()` last. Idempotent: `if not exists`, drop-then-add for checks, `on conflict` for rows.
3. Tests: coverage, derived-superset, per-group on every `child_data` table (see below), engine policies and privileges,
   no `app_all`, views invoker, test_roles rewrite, `rules.json`.
4. Notes and ADR amendment (`docs/adr/<next free>-access-by-rows.md` is created by CP-3; CP-4 amends it).

## Proofs (what the builder must make pass)
Item 3: for every `child_data` row of `access_table`, run as `app_web` through a test login that is a member of
`app_web` (with a test-only grant where the real login has none): the educator of that row's class sees it, an educator of
another class sees 0 rows, `everything` sees all, no identity sees 0. Fixtures: one seeded chain (child, enrolment, sheet,
capture, result, evidence, observation) in two classes built as the owner, plus a structural assertion for the remaining
tables that their generated policy text matches their `access_table` row. Item 2 LIVE: from `pg_policies` joined to
`access_table` where `child_data`: no policy whose roles include `app_web`, `public`, `authenticated` or `anon` has a
`qual` or `with_check` of `true` or null; prints counts and table names.

## Implementation list
- Create `supabase/migrations/<ts later than CP-3's migration>_access_every_table.sql`; `bin`-free script for phase 1
  under `packages/engine/tests/support/` (or beside the test); `packages/engine/tests/test_access_every_table.py`;
  `docs/notes/CP-4.md`.
- Modify `packages/engine/tests/test_roles.py`, `packages/engine/engine/checks/rules.json` (regenerate),
  `supabase/seed/data_register.json` (table lists), `docs/adr/<n>-access-by-rows.md` (amend). Not `workflows.json`:
  `test_layout.py` names no tables. Ruff complexity limits apply to the new test file.
