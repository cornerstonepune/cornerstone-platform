# CP-6 design: the fortnight cycle (lean: the engine enforces, no database triggers)

Status: REVISED 9 Nov 2026 after Nimish unlocked CP-6 to take the lean version (orchestrator relay: "no heavy architecture
ahead of need"). Earlier revisions (a trigger-enforced design, light 4-reviewer EGM review on 8 Nov) are in git history
(`029b674`, `ec3d1d1`). Scope: `specs/CP-6/spec.md`. Plan: `docs/backend-plan.md` (roadmap task M1-12, tier 3: a
migration). No staff or child name appears in this scope; "who" is a staff id.

## What changed from the trigger design, and what the school loses
Cut: every database trigger (freeze on `timetable_slot` and `plan_entry`, step order, no-delete, append-only history),
the SQL date and frozen functions, and the locking subtleties. Kept: the fortnight state table with who/when per step, the
history table, four step-date settings, holiday-aware step dates, and the engine reading "frozen" from the table.
Lost: the guarantee for writers that do not go through the engine. Checked 9 Nov: the website writes neither
`timetable_slot` nor `plan_entry` (only tests read them in `apps/web`), so today the engine writers (`tt_rules.py`, the
timetable loader) are the only application writers. Hand-run SQL, seed files and a future CP-7 path that forgets the check
are not caught; the reason becomes a convention enforced in one engine function. If a database guarantee is wanted later
it is a trigger on top of the same tables and the same reason setting, added by its own scope.

## Wording
Issue #454 and `spec.md` say **fortnight** (Nimish, 8 Nov: "Freeze by fortnight, not month"). Done-when 3 now says
"refused by the engine" instead of "by the database"; every other line is unchanged.

## Dependency on CP-4 (named)
CP-6 is built after CP-2, CP-3 and CP-4 merge. The proofs are written against `main` plus exactly what CP-4 adds:
`public.access_table` gains `data_class` and `reason`, and `internal.apply_conventions()` raises when a base table has no
`access_table` row. The CP-6 migration inserts one `school_wide` row per new table (reason: holds no child data) before it
ends with `select internal.apply_conventions()`. A proof checks both rows, so it fails loudly until CP-4 is on `main`.
If CP-4 renames either item, the builder runs `athena block CP-6`.

## What exists (read from the repository)
- `fortnight(id, tenant_id, academic_year_id, number, kind, starts_on, ends_on)`; only `kind = 'teaching'` fortnights are
  planned. A fortnight can cross calendar months (FN10: 23 Nov to 7 Dec). `plan_entry.fortnight_id` puts each plan line in a
  fortnight. Settings: `config(tenant_id, key, value jsonb, description)`, unique (tenant_id, key).
  `school_day.kind in teaching|holiday|changed_timing`.
- The only "frozen" in the product: `"frozen": False` at `packages/engine/engine/w2_print/k2_day.py:130` (`_who`, feeds day,
  week and period); `test_k2_day.py:119-124` asserts it false. The website only passes it through.
- Engine writers of the gated tables: `packages/engine/engine/w2_print/tt_rules.py:299-337` (fixed-slot rules) and
  `k2_timetable_sql.py` (loader apply). Seed files `supabase/seed/k2_timetable_*.sql` write them too.
- "Who" convention: `app.changed_by`, else `session_user` (curriculum_edit). The engine takes `actor` as a text id.

## Data (the contract the proofs use)
- `fortnight_cycle(tenant_id, fortnight_id pk references fortnight, state in
  ('planning','frozen','aligned','approved','list_sent'), planning_at, planning_by, frozen_at, frozen_by, aligned_at,
  aligned_by, approved_at, approved_by, list_sent_at, list_sent_by, created_at, updated_at)`. `_at` timestamptz, `_by` text.
- `fortnight_edit(id, tenant_id, fortnight_id, kind in ('state','frozen_change'), subject, record_id, op, reason,
  changed_by, created_at)`. State row: `subject` = `'planning->frozen'`, `op` = `'state'`. Frozen-change row: `subject` =
  table, `record_id` = row id as text, `op` = insert|update|delete, reason required.
- Four `config` rows per school: `fortnight.freeze`, `fortnight.align`, `fortnight.approve`, `fortnight.list_sent`, value
  `{"days_before_start": <int >= 0>}`. Migration inserts them for every school, `on conflict do nothing`.
- The migration also creates a `planning` row for every teaching fortnight of every academic year that has not ended.
  No triggers, no SQL functions.

## The engine module: `packages/engine/engine/w2_print/fortnight_cycle.py` (one file, on the map)
All take a connection; `actor` is a staff id string, never a name.
- `move(conn, fortnight_id, to_state, actor) -> None`: allows only the next state (planning, frozen, aligned, approved,
  list_sent). Skipping a step, going back, the same state, or a non-teaching fortnight raises `CycleError`. On success it
  stamps `_at`/`_by` for the new step and writes one `fortnight_edit` state row, in one transaction.
- `is_frozen(conn, tenant_id, on_date) -> bool`: true when the teaching fortnight containing the date has a row whose state
  is not `planning`. No fortnight or no row: false.
- `ensure_editable(conn, fortnight_ids, *, reason, table, record_id, op, actor) -> None`: if any given fortnight is not
  `planning` and `reason` is empty or whitespace, raises `CycleError` naming the fortnight and "give a reason"; with a reason
  it writes one `frozen_change` row and returns. Planning fortnights: returns, writes nothing.
- `step_date(conn, fortnight_id, step) -> date`: `starts_on - days_before_start`, moved to the working day before while it
  is a Saturday, a Sunday, or any `school_day` row of that school (any campus) with `kind = 'holiday'`. Raises on a missing or
  malformed setting, an unknown step, or no working day within 31 days back.
Wiring (so the freeze has effect): `tt_rules.py` fixed-slot paths and `k2_timetable_sql.py` apply call `ensure_editable`
with the fortnights their rows touch (a `plan_entry` its `fortnight_id`; a `timetable_slot` every fortnight overlapping
`valid_from` to `valid_to`, open-ended meaning every later one) and take an optional `reason` argument; the CLI/route that
reach them pass it through. `k2_day._who()` gains the connection and day and calls `is_frozen`; the literal goes. New file:
`workflows.json` is updated first (the map; `test_layout.py`), under W2.

Two details the proofs rely on: the reason reaches the writers as a new `reason=` keyword on `tt_rules.change` and on the
loader's `apply` (not the existing `Change.reason` field); and `planning_at`/`planning_by` fill themselves on insert (column
defaults: `now()` and the actor/`session_user`), so the backfill and `move` need not set them.

## "List sent" (open question, short)
Kept as the fifth state on the fortnight (materials lists are built per class and fortnight; CP-17/18 set it). Open for
Nimish: is the materials list a separate monthly step? If so `list_sent` moves to CP-17; CP-6's cycle is unchanged.

## Proofs (what the builder must make pass)
Database proofs use the throwaway Postgres (`TEST_DATABASE_URL`), rolled back, 2031 fortnights, generated ids.
1. State: five states; who/when per step; the new tables listed school-wide in `access_table` (the CP-4 dependency).
2. Dates: four settings per school, well-formed (default numbers not asserted); `step_date` honours a changed setting and
   moves holiday, Monday holiday, and weekend dates back; raises on a malformed setting.
3. Freeze: `ensure_editable` refuses a frozen fortnight with no reason and with a blank one, accepts a reason and records
   it (table, record id, who); planning fortnights write nothing; the engine writer paths (`tt_rules` fixed-slot change,
   loader apply) are refused in a frozen fortnight without a reason and succeed with one.
4. Order: `move` refuses planning to approved, planning to aligned, frozen to approved, every step back, the same state, and
   a non-teaching fortnight; the full ladder succeeds.
5. History: each `move` leaves exactly one state row with who and when.
6. No hard-coded frozen: search of `packages/engine/engine` and `apps/web` source (no node_modules, no tests) for a literal
   frozen false; plus `/timetable/day`, `week` and `period` return `frozen: true` in a frozen fortnight, false otherwise.
7. LIVE (box only, read-only): the fortnight containing today (Asia/Kolkata), or the next teaching one in a break, has a
   `fortnight_cycle` row for every school; four `fortnight.*` settings per school; `fortnight_edit` exists. Counts only.

## Decisions for Nimish
1. **Roadmap default step dates** are not in this repository. The migration seeds placeholders (freeze 14 days before the
   fortnight starts, align 10, approve 7, list sent 3) unless he gives the real ones. Done-when 2's "roadmap's defaults" is
   not fully proven until then: proofs check the settings exist and work, not their values.
2. **"Activities" in item 3** means the fortnight's plan lines (`plan_entry`) and timetable (`timetable_slot`). Not the
   curriculum `activity` table, and not `session`: teachers still record done / not done / unplanned in a frozen fortnight.
3. **Engine writers need a reason in a frozen fortnight** (fixed-slot rules, loader); they gain an optional reason argument.
4. **No way back from frozen**; a reasoned change is the only route. A reopen command would be its own scope.
5. **Decided (Nimish, 8 Nov):** the fortnight holds the state. **Decided (9 Nov, via unlock):** the engine, not the
   database, enforces the freeze.
6. **"List sent" on the fortnight** (above), unless he says it is monthly.

## Known gaps, named not fixed
- Hand-run SQL, seed files and any writer that skips `ensure_editable` are not stopped. `school_day` and `fortnight` edits
  can shift a frozen fortnight's rows and step dates. Step dates are not checked to be in order.
- New academic years need their fortnight rows (the same insert, rerun). No command or screen moves a fortnight (CP-7 and
  later); until then `move` is called from a reviewed script.

## Implementation list
- `supabase/migrations/<ts later than CP-4's>_fortnight_cycle.sql`: two tables, `access_table` rows, settings, backfill;
  idempotent; ends with `select internal.apply_conventions()`.
- `workflows.json` (map first), `packages/engine/engine/w2_print/fortnight_cycle.py` (new), `tt_rules.py`,
  `k2_timetable_sql.py`, `k2_day.py`, `test_k2_day.py` (a frozen case). Locked proofs carry the rest. `docs/notes/CP-6.md`.
