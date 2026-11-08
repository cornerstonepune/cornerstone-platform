# CP-6 design: the fortnight cycle (the issue says "month")

Status: REVISED after a light goldfish review (4 reviewers: design, implementation-readiness, codebase-details,
zoom-out) and after Nimish's decision of 8 Nov 2026, relayed by the orchestrator: **"Freeze by fortnight, not month."**
Plan: `docs/backend-plan.md` (roadmap task M1-12, tier 3: a migration). No staff or child name appears here or in the
proofs; "who" is a staff id.

## Mismatch to fix before the build (for Nimish)
Issue #454 and `specs/CP-6/spec.md` are locked and say **"month"** in What, and in Done-when 1, 3, 4 and 7. Nimish's decision
makes the **fortnight** the unit. The spec is not edited here. The proofs follow the decision, and each proof's comment
names the Done-when line it answers and its fortnight reading:

| Done-when (as locked) | Proved as |
|---|---|
| 1 a month has one state, who and when per step | a fortnight has one state, who and when per step |
| 2 step dates are settings per school; holiday moves to the working day before | same, dates counted from the fortnight's start |
| 3 changing a frozen month's timetable or activities needs a reason | same, for a frozen fortnight |
| 4 a step cannot be skipped | same |
| 5 each state change writes an edit-history row | same |
| 6 no hard-coded "frozen" in engine or website | same (unchanged) |
| 7 LIVE: the current month has a state row, settings exist | the current fortnight has a state row, settings exist |

Nimish should amend the issue wording ("month" to "fortnight" in 1, 3, 4, 7 and What) and re-lock. Until then the proofs and
the spec differ in that one word, on purpose.

## Dependency on CP-4 (named)
CP-6 is built after CP-2, CP-3 and CP-4 merge, one at a time. Proofs are written now against `main` plus exactly what CP-4 adds:
- `public.access_table` gains `data_class` (`child_data` | `school_wide`) and `reason`; `internal.apply_conventions()`
  **raises**, naming the table, when a base table has no `access_table` row. The CP-6 migration inserts one `school_wide`
  row (reason: holds no child data) per new table before ending with `select internal.apply_conventions()`. A proof checks
  both rows. Until CP-4 is on `main` that proof fails loudly (no `data_class` column): that is the dependency, not a bug.
- Nothing else of CP-3/CP-4 is used. "Who" uses `app.changed_by` (as `curriculum_edit_kept` and the engine's writers do);
  CP-2's identity work is not required. If CP-4 renames either item before it merges, the builder runs `athena block CP-6`.

## What exists (read from the repository)
- `fortnight(id, tenant_id, academic_year_id, number, kind in settling|teaching|buffer|vacation|celebration, starts_on,
  ends_on)`; `number` is set for teaching ones. FN10 runs 23 Nov to 7 Dec: a fortnight crosses calendar months, vacations
  and buffer weeks sit between fortnights (`docs/notes/m1-06-k2-plan-timetable.md`). `plan_entry.fortnight_id` puts every
  plan line in a fortnight; the materials month build also works per class and fortnight (`docs/notes/m1-16a-month-build.md`).
- Only teaching fortnights are planned, so only they get a cycle row.
- Settings: `config(tenant_id, key, value jsonb, description)`, unique (tenant_id, key). Used as is.
- `school_day(tenant_id, campus_id, on_date, kind in teaching|holiday|changed_timing)`; `academic_year(starts_on, ends_on)`.
- Rows people edit: `timetable_slot` (`valid_from`, `valid_to`), `plan_entry`, `session`.
- The only "frozen" in the product is `"frozen": False` at `packages/engine/engine/w2_print/k2_day.py:130` ("false until
  that exists", feeds day, week and period); `test_k2_day.py:119-124` asserts it false. The website passes the value through
  (`lib/educator/types.ts`, `components/educator/day-head.tsx`); nothing hard-coded there, and a proof keeps it so.
- Edit-history precedent: `curriculum_edit` (append-only trigger); who from `app.changed_by`, else `session_user`.

## Goal
Each teaching fortnight has one state, moving forward one step at a time, each step with who and when. After the freeze, the
fortnight's timetable and plan lines change only with a stated reason, which is stored. Engine and website read the state
from the database.

## Data (the names are the contract the proofs use)
- `fortnight_cycle(tenant_id uuid, fortnight_id uuid references fortnight, state, planning_at, planning_by, frozen_at,
  frozen_by, aligned_at, aligned_by, approved_at, approved_by, list_sent_at, list_sent_by, created_at, updated_at)`;
  pk `fortnight_id`; `state in ('planning','frozen','aligned','approved','list_sent')`; `_at` timestamptz, `_by` text.
  The fortnight must be `kind = 'teaching'` (trigger). The trigger owns the stamps.
- `fortnight_edit(id uuid, tenant_id, fortnight_id, kind in ('state','frozen_change'), subject text, record_id text, op
  text, reason text, changed_by text, created_at)`: append-only (update/delete refused). State row: `subject` =
  `'planning->frozen'`, `op` = `'state'`, no reason. Frozen-change row: `subject` = table, `record_id` = row id as text,
  `op` = insert|update|delete, reason required. One edit writes one row. No before/after snapshots.
- **who** = `coalesce(nullif(btrim(current_setting('app.changed_by', true)), ''), session_user::text)`.
- **reason** = `nullif(btrim(current_setting('app.change_reason', true)), '')`, set by `select set_config('app.change_reason',
  '<text>', true)` (this transaction only). Unset, empty and whitespace all mean "no reason".
- Settings, four `config` rows per school: `fortnight.freeze`, `fortnight.align`, `fortnight.approve`, `fortnight.list_sent`;
  value `{"days_before_start": <int >= 0>}` = how many calendar days before the fortnight's `starts_on` the step is due.
  Inserted by the migration for every school, `on conflict do nothing`.
- `public.fortnight_step_date(fortnight_id, step) -> date`: `starts_on - days_before_start`, then moved to the working day
  before while it is a Saturday, a Sunday, or any `school_day` row of that school (any campus) with `kind = 'holiday'`.
  Raises on a malformed setting, an unknown step, or when no working day exists within 31 days back.
- `public.fortnight_is_frozen(tenant, on_date) -> boolean`: true when the teaching fortnight containing that date has a
  cycle row whose state is not `planning`. A date in no fortnight, or in a fortnight with no row, is not frozen.
- Rows: the migration creates a `planning` row for every teaching fortnight of every academic year that has not ended.
  Later years: the same insert is rerun when the year is added (follow-up).

## The rules (database triggers; no application code decides)
1. **State moves one step.** BEFORE INSERT on `fortnight_cycle` requires `planning`. BEFORE UPDATE allows no change or the
   next state only (planning, frozen, aligned, approved, list_sent). A skip (planning to approved, frozen to approved) or a
   step back raises. It stamps the new step's `_at`/`_by`; refuses to change `fortnight_id`, `tenant_id` or an earlier
   step's stamps. DELETE and TRUNCATE are refused (no row means planning, so deleting would unfreeze quietly). No reopen: a
   frozen fortnight is changed with a reason (rule 3).
2. **History.** After each state change one `fortnight_edit` state row is written.
3. **Freeze.** BEFORE INSERT/UPDATE/DELETE on `timetable_slot` and `plan_entry` (not `session`: decision 2): if any
   fortnight the OLD or NEW row touches is not `planning` and there is no reason, raise, naming the fortnight and "give a
   reason". With a reason it goes through and one `fortnight_edit` `frozen_change` row is written (for the first
   non-planning fortnight found). A `plan_entry` touches its `fortnight_id`. A `timetable_slot` touches every fortnight that
   overlaps `valid_from` to `valid_to` (open-ended = every later one), so editing or ending a long-running slot is gated if
   any fortnight it covers is frozen. That over-blocks on purpose: a frame change that rewrites a frozen fortnight is never
   quiet. The trigger reads the cycle row `FOR SHARE`, so a change cannot slip past a concurrent freeze.
   Fortnights that straddle two calendar months no longer matter: the fortnight is the unit, so there is no month boundary to fall across.
4. **Step dates are dues, not triggers.** Nothing moves a fortnight on its date. People move it (CP-7 and later). Out of scope.

## "List sent" (open question, short)
The issue's list ends in "list sent", and the materials list belongs to CP-17/CP-18. Materials lists are built per class
and per fortnight, so this design keeps `list_sent` as the fifth state **on the fortnight**; CP-17/CP-18 set it. Open
question for Nimish: is that right, or is the materials list a separate monthly step? If monthly, `list_sent` moves out of
CP-6 and CP-17 owns a month row; CP-6's four-step cycle is unchanged.

## Engine and website (item 6)
`k2_day._who()` gains the connection and the day and calls `fortnight_is_frozen(klass tenant, day)`; day, week and period
use it; the literal goes. `test_k2_day.py:119-124` stay true (nothing frozen there); the builder adds a frozen case for all
three. The website's "frozen: read only" wording (`lib/educator/words.ts:84`) stays (screens out of scope).

## Proofs (what the builder must make pass)
Database proofs run on the throwaway Postgres (`TEST_DATABASE_URL`), rolled back, as CP-1 does. They use fortnights built in
2031 so no shared fixture is disturbed.
1. `test_state.py`: five states; who/when per step; insert at `frozen` refused; a non-teaching fortnight refused; both new tables listed `school_wide`.
2. `test_dates.py`: four settings per school, well-formed (default numbers not asserted, decision 1); `fortnight_step_date`
   honours a changed setting, moves a holiday to the working day before, a Monday holiday past the weekend to Friday, a
   weekend back, raises on a malformed setting.
3. `test_freeze.py`: planning fortnight: `timetable_slot` and `plan_entry` change freely. Frozen: insert, update, delete
   refused with no reason or a blank one; succeed with a reason and `fortnight_edit` records reason, table, record id,
   who. A row moved out of a frozen fortnight is refused; an open-ended slot covering a frozen fortnight is refused; a
   neighbouring planning fortnight is unaffected; `session` writes are untouched.
4. In `test_state.py`: planning to approved, planning to aligned, frozen to approved and every step back raise; the full ladder succeeds; delete/truncate of a cycle row refused.
5. `test_history.py`: each transition leaves exactly one state row; `fortnight_edit` cannot be updated or deleted.
6. `test_no_hardcode.py`: search of `packages/engine/engine` and `apps/web` source (no node_modules, no tests) for a literal frozen false;
   plus `/timetable/day`, `week` and `period` returning `frozen: true` for a date in a frozen fortnight, `false` otherwise (reusing `world`/`call` from `test_k2_day.py`).
7. `live_fortnight.py` (box only, read-only transaction): counts only. The fortnight containing today (Asia/Kolkata), or
   the next teaching one in a break, has a `fortnight_cycle` row for every school; four `fortnight.*` settings per school;
   `fortnight_edit` exists.

## Decisions for Nimish
1. **The roadmap's default step dates.** Roadmap v23 is not in the repository, so the numbers cannot be checked here. The
   migration seeds placeholders (freeze 14 days before the fortnight starts, align 10, approve 7, list sent 3) unless Nimish
   gives the roadmap's. The proofs check the settings exist and work, not their values, so Done-when 2's "roadmap's
   defaults" is **not fully proven** until the real numbers are in.
2. **What "activities" means in item 3.** The fortnight's plan lines (`plan_entry`, which name the activities) plus the
   timetable (`timetable_slot`). Not the curriculum `activity` table (school-wide), and not `session`: teachers still record
   done / not done / unplanned in a frozen fortnight with no reason. Gating periods too needs a delivery exemption and a proof.
3. **Existing engine writers are refused in a frozen fortnight unless they pass a reason.** `tt_rules.py:299-337` (fixed-slot
   rules) and the timetable loader write the gated tables. That is the point of the freeze; they are not changed here.
4. **No way back from frozen.** A reason-bearing change is the only route; a reopen command would be its own scope.
5. **DECIDED (Nimish, 8 Nov 2026: "Freeze by fortnight, not month").** The fortnight holds the state. Options considered:
   month holds the state with plan lines following the month their fortnight starts in (rejected: a straddling fortnight
   would be half-locked); lock a fortnight when either month is frozen (rejected: double blocking). The issue's wording
   needs amending (see the top).
6. **"List sent" stays on the fortnight** (above) unless Nimish says it is monthly.

## Known gaps, named not fixed
- `school_day` and `fortnight` edits (a holiday added, a fortnight moved) can shift a frozen fortnight's rows and step dates;
  not gated. Step dates are not checked to be in order.
- Bulk loaders and seed files (`supabase/seed/k2_timetable_*.sql`) write the gated tables; they run into planning
  fortnights only.
- A superuser or migration can disable a trigger. The rule guards the application roles, not the database owner.
- New academic years need their fortnight rows; today the same insert is rerun by hand.
- No command or screen moves a fortnight (out of scope); until CP-7 the state changes only by `update` in a reviewed script.

## Implementation list
- `supabase/migrations/<ts later than CP-4's>_fortnight_cycle.sql`: tables, `access_table` rows, settings, functions,
  backfill, then the triggers (after the backfill); idempotent; ends with `select internal.apply_conventions()`.
- Modify `packages/engine/engine/w2_print/k2_day.py` (connection and day into `_who`), `packages/engine/tests/test_k2_day.py`
  (a frozen case). Locked proofs carry the rest. `docs/notes/CP-6.md` at commit boundaries. Not `workflows.json`.
