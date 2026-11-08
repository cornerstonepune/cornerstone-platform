# CP-13 design: child level rule, second change

Status: DRAFT for review. Scope: `specs/CP-13/spec.md` (issue #461). Tier 3. Waits for CP-4 (plan order); CP-2/3/4 are built
one at a time, so this design and its proofs are written against **the schema on main today plus what CP-4 adds**.

## Dependency on CP-4 (named, not hidden)
CP-4 adds `access_table.data_class` and makes `apply_conventions()` **raise** when a base table has no `access_table`
row. Consequence for CP-13: any new table CP-13 creates must insert its own `access_table` row in the same migration,
as `school_wide` with a reason (it holds a rule number, no child data). Proofs build the throwaway database from
**every migration present**, so they run before and after CP-4 lands: the new table's row is asserted only if
`access_table` exists. Nothing else here reads CP-3/CP-4 objects.

## What already exists on main (read from the migrations; the proof-writer must confirm by running)
- Migration `20261223090000` (goal gr1) already did most of items 1, 2, 5, 6 in the **written** graph:
  - `graph_level_window` computes `repeating` from the level's last `state.window_answers` answers only; a mistake
    absent from that window is not repeating, and `state.repeat_clears_after` right answers on later papers clear it.
  - `adults` is `count(distinct seen_by)` over the window, so one adult twice is one. `seen_by` is the staff id as text
    (`voice_confirm.py` writes `str(staff)`), so the same adult is the same string.
  - `graph_skill_states()` is the single rule; `rebuild_child_skill_state` deletes and re-inserts from it under an
    advisory lock; `graph_answer` reads `confirmed_by is not null` only.
- **Not yet true, and the real work of CP-13:**
  - the minimum adults is one **global** threshold row `state.min_adults` = 2 (`graph_state_of` reads it per school, no
    grade). K2's 1 lives separately in `observed_rule.min_adults`, read only by the K2 observed path. (Item 3.)
  - nothing produces the list of states that would change (item 4). `engine live data` (`checks/live_data.py`,
    `_stale_graph`) already compares stored `child_skill_state` with `graph_skill_states()` but prints stale rows, not
    counts by transition.
- On live today every row the graph reads is a written answer with `seen_by` null, so `adults` = 0 and the adults rule
  holds nothing back (`graph_state_of` applies it only when `adults > 0`). Expect the item-4 list for the adults change
  to be empty or tiny on live; it is still produced and shown.

**Honest consequence for the proofs:** items 1, 2, 5 and 6 may already pass on main. Those proofs are regression locks
(they pin behaviour so a later change cannot lose it), and the proof-writer reports for each item whether it failed
before the build. Only items 3 and 4 are expected to fail first. Nimish should read that before locking.

## Decisions

### D1. Minimum adults: a table, one row per grade (item 3)
New table `state_adults (tenant_id, grade_code, min_adults int check > 0, unique (tenant_id, grade_code), fk to
grade(tenant_id, code))`. Seeded for every existing grade at 2, K2 at 1, and for a new school by a trigger named to sort
after the vocabulary triggers (the `voice_vocabulary_then_observed_rules` precedent). Idempotent (`on conflict do
nothing`).
- `graph_state_of(...)` stops reading `state.min_adults`; the window function supplies the **child's grade minimum**
  (`child.band` is the grade code today; the build reads it the same way after CP-1, which keeps `band`). A grade with
  no row falls back to the largest value in the table for that school, never to a number in code. [open for review:
  see Q1]
- The threshold row `state.min_adults` and its seed entry are removed in the same migration so there is one home;
  `test_graph_rule.py:113` lists it and is updated.
- Alternative rejected: reuse `observed_rule.min_adults`. It has `secure_level/secure_days/recheck_days` NOT NULL, so a
  G1 row would invent K2-observed numbers.
- Duplication kept on purpose: `observed_rule.min_adults` (K2 observed path) stays. A test asserts both equal for K2,
  so they cannot drift. Retiring one belongs to a later scope (not asked here).
- No Python or TypeScript carries the number (rule 1); a test greps for it.

### D2. One adult counts once (item 2)
Behaviour exists. Build adds nothing unless the proof shows a gap: the proof covers the written graph (two answers
same `seen_by` = 1 adult), the K2 observed path (`who` array), and the case of different-case or padded text, which is
**not** normalised today. Decision: no normalisation, because `seen_by` is a staff id, not typed text; the proof pins
that two *different* ids count as two and one id twice as one. [open: Q2]

### D3. Repeating clears (item 1)
Behaviour exists in the window rule. Proof: a mistake in 2 of the last answers marks the skill `patterned_error`; the
same child after more answers push it out of the window (or enough right answers on later papers) is no longer
`patterned_error`, and `repeating_misconception` in the rebuilt `child_skill_state` row is null. Plus
`next_difficulty` no longer targets it.

### D4. The three signals (item 5)
Blank, wrong, wrong-with-working are distinct in ring A today (`correct`/`misconception_codes`/mark kinds). Proof: the
three evidence kinds written separately are three distinct stored values after a rebuild, and no migration or function
collapses them (checked by inserting each and reading back what the graph exposes). Exact column names are read by the
proof-writer from `evidence_event` and `graph_answer`; the design does not restate them.

### D5. Rebuilt from confirmed only, twice the same (item 6)
Proof: unconfirmed evidence changes nothing; `rebuild_child_skill_state` run twice gives identical rows (ignoring
`computed_at`/timestamps); a superseded read is ignored.

### D6. The list of states that would change (item 4), a separate approval
- New function `public.graph_state_changes(p_child uuid default null)` returns one row per
  `(grade_code, old_state, new_state)` with `skills` (rows) and `children` (distinct) **counts only**. No child id,
  name or skill code is returned. `old_state` is the stored `child_skill_state` row (absent = `none`), `new_state`
  is `graph_skill_states()`. It is `stable`, writes nothing, and is read-only for `app_engine`.
- Thin CLI `engine graph --changes` prints the table and exits 0; it never rebuilds. `workflows.json` gets the
  command (test_layout checks it). Nimish reads this list **on a copy of live data**; saying yes is a separate
  step: the existing `engine graph` rebuild, run by a person after his yes. The proof checks the list exists and is
  counts-only, and that producing it leaves `child_skill_state` unchanged. It never runs the rebuild on anything but
  its own throwaway database.
- Output saved to `docs/notes/CP-13.md` by the builder on the copy run, counts only. No live write anywhere.

## Out of scope kept out
Skill links (CP-14), any screen, changing `observed_rule`'s other numbers, retiring `observed_rule.min_adults`.

## Open questions for review
- Q1: grade with no `state_adults` row: fall back to the school's largest value, or fail the rebuild loudly?
- Q2: is `seen_by` always a staff id (so no normalisation), or can typed text reach it?

## Files the build touches (for the proof-writer)
`supabase/migrations/<next>.sql` (table, seed, trigger, `graph_state_of`/`graph_level_window` or `graph_skill_states`
change, `graph_state_changes`, grants, `access_table` row if present), `supabase/seed/thresholds.json`,
`packages/engine/engine/cli.py` + the w3_read graph command file, `workflows.json`, `packages/engine/tests/
test_graph_rule.py`. No `apps/web` change.
