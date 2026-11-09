# CP-13 design: child level rule, second change

Status: REVISED after goldfish review (zoom-out, codebase-details, implementation-readiness; dispositions in
`specs/CP-13/design-review/summary.md`). Scope: `specs/CP-13/spec.md` (issue #461). Tier 3. Waits for CP-4.
CP-2/3/4 are built one at a time, so proofs are written against **the schema on main plus what CP-4 adds**.

## Dependency on CP-4
CP-4 makes `apply_conventions()` raise for a base table with no `access_table` row. CP-13 creates **no new table**
(D1 is a column on `grade`; `grade` is already a table CP-4 lists), so it needs no CP-4 object and no conditional. The
proofs build the throwaway database from every migration present (CP-4's `conftest.py` pattern: `TEST_DATABASE_URL`, else
a temp Postgres; never `DATABASE_URL`), so they run before and after CP-4 lands.

## What exists on main (reviewers read the migrations; the proof-writer confirms by running)
- Items 1, 5, 6 hold in the written graph (migration `20261223090000`): `graph_level_window` computes `repeating` over a
  level's last `state.window_answers` answers (a mistake absent from the window is not repeating; `state.repeat_clears_after`
  right answers observed after its last showing, inside the window, also clear it); blank = `correct` null, wrong =
  `correct` false with empty `misconception_codes`, wrong-with-working = `correct` false with codes; `graph_answer` reads
  `confirmed_by is not null` and drops superseded captures; `rebuild_child_skill_state(uuid) returns integer` deletes and
  re-inserts from `graph_skill_states()` under an advisory lock.
- Item 2: `adults` is `count(distinct seen_by)`; `seen_by` is a staff id as text (`voice_confirm.py` writes `str(staff)`).
  **But the written graph never sees an adult today**: `evidence_placed`/`graph_answer` read `kind = 'written'` and written
  rows carry `seen_by` null, so `adults` = 0 and `graph_state_of` skips the adults test (`p_adults > 0 and ...`). The K2
  observed path (`graph_observed_states`, kind `observed`) is where adults are real: `who` array.
- Item 3 is missing: the minimum is the global threshold `state.min_adults` = 2; K2's 1 is `observed_rule.min_adults`.
- Item 4 is missing: `engine live data` (`checks/live_data.py:_stale_graph`) lists stale rows, not counts by transition.

**Consequence for the proofs.** Items 1, 5, 6 and the written-graph half of 2 should already pass on main: those proofs are
regression locks, the whole deliverable for those items, and the proof-writer reports for each whether it failed first. Any
proof that fails on main becomes build work. Items 3 and 4 fail first (no column; no function).

## Decisions

### D1. Minimum adults: one column on `grade` (item 3)
`alter table grade add column min_adults int not null default 2 check (min_adults > 0)`. Every grade, existing or added later,
has the value, so no new table, no seeding trigger, no fallback rule. K2 is set to 1 in the migration for existing schools, and
by one added statement inside `internal.observed_rules(p_tenant)` for schools added later (that function already runs after the
vocabulary for every new school).
- **One home.** `graph_observed_states` reads `grade.min_adults` instead of `observed_rule.min_adults`; the column
  `observed_rule.min_adults` is dropped. The threshold row `state.min_adults` and its seed entry go.
- `graph_level_window` returns the child's grade minimum (the child's current `child.band`, an FK to `grade`; migration
  `20261220090000` lets a child change grade, so it is read live). `graph_state_of` takes it as a parameter, replacing its
  threshold lookup. This changes its 9-argument signature, so the migration also recreates what the earlier migration
  dropped around it: views `child_level_state`, `level_calibration`, and the grants naming the signature (`app_engine`,
  `app_web`).
- Callers and tests the build must update (reviewer-listed): `packages/engine/tests/test_graph_rule.py` (`_state` at 95,
  `RULE_ROWS` at 113, the source-grep at 129-135), `test_calibration.py` (`_the_rule` hard-codes `0 < adults < 2`; line 192
  checks the definition text; call at 365), `test_roles.py:72-73`, `test_k2_picture.py:224` (the `observed_rule` row),
  `supabase/seed/thresholds.json`, and the docs that cite `state.min_adults` (ADR 0098, `docs/notes/gr1-...`,
  `docs/notes/m1-02-...`; goals/ stays read-only history).
- Rejected: a new `state_adults` table with a trigger and a "largest value" fallback (more code, same effect); reusing
  `observed_rule` (its other columns are NOT NULL K2 numbers).

### D2. One adult counts once (item 2)
Behaviour exists; no normalisation, because `seen_by` is a staff id. Proof on the K2 observed path with real inserts: two
confirmed observed notes by the same staff id, on different days, on one skill give `adults` = 1 in `child_observed_state`
and (with the grade minimum 2) never `secure`; a second different staff id gives 2. Plus the written-graph function
(`graph_state_of` called directly) with the adults argument 1 vs 2. Known edge, stated not fixed: in the written graph a
window mixing null-`seen_by` rows with one adult-named row has `adults` = 1, so it reads as `practising` under a minimum of 2.

### D3. Repeating clears (item 1)
Proof through `rebuild_child_skill_state`: a mistake code in 2 of a level's window gives `state = 'patterned_error'` and
`repeating_misconception` = that code in `child_skill_state`; after enough later answers without it, a rebuild gives a state
other than `patterned_error` and `repeating_misconception` null.

### D4. Three signals (item 5)
Blank / wrong / wrong-with-working are three distinct stored values (`correct` null; `correct` false + empty codes;
`correct` false + codes). Proof: write one answer of each kind through `answer_evidence` (migration `20261015090000`),
read back `graph_answer`, assert three distinct `(correct, misconception_codes)` shapes and that only the non-blank two
count toward the window (`n_events`).

### D5. Rebuilt from confirmed only, twice the same (item 6)
Proof: an unconfirmed evidence row changes no `child_skill_state` row; two consecutive `rebuild_child_skill_state` calls give
identical rows apart from timestamp columns.

### D6. Item 3's proof: edit the row, see the result move
Same child answers, K2 observed path: with `grade.min_adults` = 1 for K2 the skill reaches `secure_to_recheck`/`secure` on one
adult; `update grade set min_adults = 2 where code = 'K2'`, rebuild with no code change, and it does not; and a non-K2 grade
defaults to 2. A static test asserts no Python/TypeScript under `packages/engine/engine`, `apps/web` carries a
`min_adults` literal or a `state.min_adults` key.

### D7. The list of states that would change (item 4), a separate approval
```
public.graph_state_changes(p_child uuid default null)
returns table (grade_code text, old_state text, new_state text, skills int, children int)
language sql stable
```
One row per grade and transition where `old_state is distinct from new_state`. `old_state` is the stored
`child_skill_state.state` (the literal `'none'` when no stored row); `new_state` is `graph_skill_states(p_child)`'s state;
`skills` = rows, `children` = distinct children. Grade is the child's `child.band`. Counts only: no uuid or free-text
column. `p_child` filters to one child. Execute granted to `app_engine`; it writes nothing.
- `engine graph --changes` (`packages/engine/engine/cli.py:113`, which calls `engine/assess/graph.py`) prints the rows and
  exits 0; it never calls the rebuild. `workflows.json` gets the flag (`test_layout.py` checks it). A new SQL function is
  kept over extending `_stale_graph` because `_stale_graph` returns row-level differences, not counts by grade and
  transition, and counts-only is enforced by the function's column types.
- **Separate approval.** Nimish reads this list on a copy of live data; saying yes is a human step; applying is the existing
  `engine graph` rebuild, run by a person afterwards. The proofs check only that the list exists and is counts-only, that
  `provolatile` is stable, that running the function and the CLI flag leaves every `child_skill_state` row identical, and
  that the rebuild is never invoked by them. `docs/notes/CP-13.md` (counts, from the copy run) is written by the builder
  and is not tested.

## Out of scope
Skill links (CP-14), any screen, other `observed_rule` numbers, new-school behaviour beyond K2's value.

## Files the build touches
One migration `supabase/migrations/<next after main>_grade_min_adults.sql`; `supabase/seed/thresholds.json`;
`packages/engine/engine/cli.py`, `engine/assess/graph.py`; `workflows.json`; the tests and docs in D1.
No `apps/web` change.
