# CP-7 design: the fortnight's timetable: draft, approve only what changed, an unchanged fortnight rolls forward

Status: REVISED (second time, 8 Nov 2026) to Nimish's decision, relayed by the orchestrator: *"a fortnight is the unit of
the timetable, and then everything gets derived from that."* Approval is per fortnight; weeks A and B, days and periods are
views of it, with no approval of their own. Earlier revision: four fresh goldfish reviewers (`design-review/summary.md`);
every fix they asked for is kept below. Draft; not locked.
Plan: `docs/backend-plan.md` row CP-7 (roadmap task M1-06, the approval step it never got). Tier 3: a migration.
Waits for CP-6 (the fortnight cycle), and through it for CP-3 and CP-4. No staff or child name appears here or in the
proofs; "who" is a staff id.

## The problem
The K2 timetable is generated from the school's two-week frame and the Monthly Planner and goes straight to the
educators' screens. Nobody approves it (reconciliation of 8 Nov: "no approval step at all", M1-06). Goalpost: *a drafted
week that matches last week writes no approval; one changed line writes exactly one; FN10 and December 2026 are stored as
named exceptions.* D-018 (`docs/notes/m1-06-k2-plan-timetable.md` (d)): an unchanged timetable rolls forward with no
approval. At the school's unit, "week" in the goalpost reads as **fortnight**.

## Decided (Nimish, 8 Nov; no open questions)
- **The unit is the fortnight.** A class's fortnight is drafted, compared with its last settled fortnight, and approved
  as one. Weeks A and B, days and periods are derived views: no approval, state or table of their own.
- **What is compared is the timetable grid**: each period of each day of the fortnight (week A or B, weekday, period):
  its kind, subject and the frame's wording. The planner's words inside a period are the school's own text, copied, and
  locked by CP-6's freeze ("timetables are locked at the fortnight level"); they are not re-approved here.
- **Who approves**: anyone in the coordinator or "Everything" group of CP-3 ("simple blanket authority"; "do not restrict
  the coordinator"). A settings row, so it changes without code.
- **The fortnight cannot be marked approved (CP-6's step) until every class's fortnight is settled.** That is what the
  lock at the fortnight level means; otherwise the approval has no effect.

## Goals
1. Drafting a class's fortnight records its lines and which changed against its last settled fortnight.
2. An unchanged fortnight rolls forward and writes no approval.
3. Each changed line gets a person's decision, one approval row per decision; one action approves all open lines.
4. Drafting an unchanged fortnight again writes nothing.
5. CP-6's `approved` step waits for every class's fortnight to be settled.

## Non-goals
Any screen. **Approval does not hide or change anything educators see yet.** Per-week or per-day approval. Approving
the planner's words. Moving a fortnight on its date. The materials list (CP-17, CP-18). The FET generator (CP-11).
Reminders.

## Dependencies (named)
CP-7 is built after CP-6 merges; CP-6 waits for CP-4, which waits for CP-3. One at a time. Proofs are written against
`main` plus exactly these:
- **CP-6:** `fortnight_cycle(fortnight_id, state)`, states `planning, frozen, aligned, approved, list_sent`; its freeze on
  `timetable_slot` and `plan_entry` (CP-7 adds no gate on them).
- **CP-4:** `public.access_table(data_class, reason)`; `internal.apply_conventions()` raises for an unlisted table. Both
  new tables are listed `school_wide` (reason: holds no child data).
- **CP-3:** the role-to-group rows. The approver check joins `public.current_staff()` to `staff_role_grant` and those
  rows; CP-3's design fixes the table and group-code names, and the builder uses them as merged.
- If any is renamed before it merges, the builder runs `athena block CP-7`. Until CP-6 is on `main`, the proofs touching
  `fortnight_cycle` fail loudly: that is the dependency, not a bug.

## What exists (read from the repository)
- `timetable_slot(school_class_id, period_id, week_code, weekday 1..5, kind, subject_code, text, valid_from, valid_to)`,
  temporal, no overlap constraint. `fortnight(academic_year_id, kind, number, starts_on, ends_on)`; number unique per
  year only.
- `approval` ledger (`20261208090000_one_approval_list.sql`): append-only; `approval_kind` per school, seeded by
  `internal.approval_begins(tenant)` and a tenant trigger. **`internal.approval_checked()` (lines 133-154) treats every
  `approved` row as a second approval and raises for any kind not in `approval_list`**, so it must change (rule 5).
- `public.current_staff()` (`20270112090000_current_staff.sql`): the signed-in staff id from `app.staff_id`, null when
  not a uuid. `app.changed_by` is free text, used only for "by".
- `internal.apply_conventions()` adds an `updated_at` touch trigger to every table; `internal.forbid_delete()` refuses
  deletes and keeps updates.
- `engine timetable load` (`w2_print/cli_timetable.py`, 158 of 400 lines; W2 step N4; default `--year 2026-27`).
- M1-06 planned `week_plan` and `timetable_version` for "the approval step"; a versioned `fortnight_plan` replaces both.

## Technical plan

### Data (the names are the contract the proofs use)
- `fortnight_plan(id, tenant_id, school_class_id, fortnight_id, version int > 0, state in ('draft','approved',
  'rolled_forward'), baseline_id null references fortnight_plan, drafted_at, drafted_by, settled_at, settled_by,
  created_at, updated_at)`; unique (school_class_id, fortnight_id, version). Teaching fortnights only (trigger). The
  newest version counts.
- `fortnight_plan_line(id, tenant_id, fortnight_plan_id, week_code A|B, weekday, on_date, period_id, kind, subject_code,
  text, changed boolean, approval_id null references approval, created_at, updated_at)`; unique (fortnight_plan_id,
  week_code, weekday, period_id). A week, a day or a period is a `where` on these rows.
- Both: `internal.forbid_delete()`; app roles may only read; written only by the `security definer` functions below.
- `approval_kind` gains `needs_first boolean not null default true`; new kind `timetable_line` ("a changed line of a
  fortnight's timetable", `reaches_parent` false, `needs_first` false). `approval.target` = the line id as text.
  `supabase/seed/vocabulary.json` gains it too (ord 3).
- Settings per school: `fortnight.no_roll_forward` = `{"2026-27": [10, 11]}` (FN10, the first generated, and FN11, December
  2026's only teaching fortnight; per academic year so next year starts clean) and `fortnight.approver_groups` =
  `["<CP-3 code for Everything>"]` plus the coordinator group's code if CP-3 has one (coordinators sit in Everything
  in CP-3's spec). A missing row raises.
- `internal.approval_begins(tenant)` is redefined: its three kinds and four states kept, plus the new kind and both
  settings, so every school, present and future, has them.

### The rules (database functions and triggers; no application code decides)
1. **Draft** `public.fortnight_draft(p_class uuid, p_fortnight uuid) returns uuid` (newest version's id):
   - Refused unless the fortnight's cycle is `frozen` or `aligned` (read `for share`). Advisory lock on (class, fortnight).
   - Lines: each school weekday of weeks A and B on its real date (Monday of the week holding `starts_on`, plus
     weekday - 1, plus 7 for B), the class's slot of that week letter, weekday and period valid on that date. Two slots
     for one period raise; a fortnight with no slot raises (never rolls forward empty).
   - Baseline: the class's newest `approved` or `rolled_forward` version in an earlier teaching fortnight, ordered by
     `starts_on desc, version desc`.
   - Changed: every line, when there is no baseline or the fortnight's number is listed for its year in
     `fortnight.no_roll_forward`. Otherwise a line differing from the baseline's line at the same (week, weekday, period)
     in kind, subject or text. A missing line and an `empty` line are equal; a baseline period that is now gone is
     written as a changed `empty` line, approved once and not again.
   - Rerun: same baseline and equal lines as the newest version: nothing written; its id returned.
   - New version otherwise. A line equal to an approved line of the previous version (same baseline) carries its
     `approval_id`. No line open: `rolled_forward` (nothing changed) or `approved` (all carried); both stamp
     `settled_at`/`settled_by`. Else `draft`.
2. **Decide** `public.fortnight_line_decide(p_line uuid, p_decision text, p_reason text default null) returns void`:
   locks the plan row `for update`, re-checks (newest version, `draft`, line changed and not yet approved), writes
   exactly one `approval` row (`by` = `app.changed_by`, else the staff id). `approved` sets `approval_id`; `sent_back`
   needs a reason and leaves the line open to be approved later. No open line left: the plan becomes `approved`.
3. **Approve the rest** `public.fortnight_approve_open(p_plan uuid) returns int`: the same checks, one `approval` row per
   open changed line; the count returned. One action for an exception fortnight or a large change.
4. **Who may decide** (in `internal.approval_checked`, so a direct insert into `approval` is held to it too): for kind
   `timetable_line`, `current_staff()` is an active staff member of the school with a role grant valid on
   `current_date` whose CP-3 group is in `fortnight.approver_groups`; else "only the approving group decides a
   fortnight's line". Functions are `security definer set search_path = public`; `fortnight_draft` executable by
   `app_engine`, the other two by `app_web` and `app_engine`; revoked from public, anon and authenticated.
5. **Ledger fix** (`internal.approval_checked`, redefined): the second-approval check runs only for kinds with
   `needs_first`; existing kinds behave exactly as before (a proof keeps it so).
6. **Gate** (a new trigger on CP-6's `fortnight_cycle`, its own function): a move to `approved` is refused, naming the
   class, while any class with slots valid in that fortnight lacks a newest `fortnight_plan` in `approved` or
   `rolled_forward` whose lines still equal the current frame (re-derived by the draft's own line function). No grade is
   named in code.

### Refusals (message stems the proofs match; errcode)
| Refusal | Stem | errcode |
|---|---|---|
| draft outside `frozen`/`aligned` | `fortnight cannot be drafted: fortnight <n> is <state>` | 23514 |
| no slot in the fortnight | `fortnight has no timetable: class <id>` | 23514 |
| two slots for one period | `two slots for one period: class <id> <date> period <id>` | 23514 |
| not a teaching fortnight | `only a teaching fortnight is planned` | 23514 |
| caller not in the groups | `only the approving group decides a fortnight's line` | 42501 |
| line not changed / not newest draft / already approved | `line is not open: <why>` | 23514 |
| direct write by an app role, or a delete | Postgres's own refusal | 42501 / P0001 |
| CP-6 gate | `fortnight <n> cannot be approved: class <id> is not settled` | 23514 |
| missing setting | `setting <key> is missing for this school` | 23514 |

### Flow
```
frame (timetable_slot) --fortnight_draft--> fortnight_plan vN (lines for A and B; changed vs last settled fortnight)
                                             | nothing changed   -> rolled_forward (no approval)
                                             | n changed lines   -> draft --decide x n / approve_open--> approved
fortnight_cycle: aligned -> approved   refused until every class's fortnight is settled and matches the frame
week / day / period views              = filters on fortnight_plan_line; nothing of their own
```

### Engine
- `engine timetable draft --fortnight N [--year 2026-27] --by <text> [--apply]` in `cli_timetable.py`, mirroring `load`:
  dry run unless `--apply`; sets `app.changed_by` from `--by`; calls `fortnight_draft` for every class with slots in
  fortnight N; prints one line per class, verbatim `  <grade> <section>: rolled forward` / `: approved` /
  `: <n> lines waiting`. No approve command: approving is a person's act through the functions until the screen exists.
- `workflows.json` N4: `commands` gains `engine timetable draft`.

## Alternatives considered
- **Approval per week (the first two drafts).** Rejected by Nimish, 8 Nov: the fortnight is the unit; weeks are views.
- **Compare the planner's words too.** Rejected by Nimish's decision: the timetable is what is locked and approved; the
  words are locked by CP-6's freeze.
- **Approve a whole fortnight with one row.** Rejected by author: the goalpost is one approval per changed line;
  `fortnight_approve_open` gives the one action without hiding which lines were approved.
- **Recompute the baseline from slot history.** Rejected by author: a slot changed in place (allowed with a reason under
  CP-6) rewrites history.
- **The state on `fortnight_cycle` itself.** Rejected by author: that row is one per school; a class's timetable differs
  from another's, so the plan is per class and the cycle waits for all of them.
- **Approver from `app.changed_by`.** Rejected by author: free text any session can set.

## Mechanical choices (decided here, with the reason)
- Exceptions per academic year, default 2026-27 Fortnights 10 and 11.
- Versions, not edits; approvals carried onto identical lines; the newest version counts.
- Draft only in `frozen`/`aligned`; the gate re-derives the frame, so a stale approval never passes.
- Fixed daily rows are lines like any other: a moved lunch is a change.
- No fortnight is drafted automatically; a person (or a later n8n flow calling the command) runs it.

## Known gaps, named not fixed
- A frame change after the fortnight is `approved` (possible with a reason under CP-6) leaves a later draft waiting; it
  does not move the fortnight back (CP-6 decision 4: no way back).
- Approval does not change what educators see (non-goal).
- `approval_list` (the coordinator's list) does not show timetable lines until the screen scope adds them.

## Proofs (written by the proof-writer after the lock)
Database proofs on the throwaway Postgres (`TEST_DATABASE_URL`), rolled back, as CP-6's are. Fixtures: academic year
`2031-32` with teaching fortnights 9, 10 and 11 and their `fortnight_cycle` rows; slots seeded while `planning`, then
`frozen`; an approver (role `coordinator`, `valid_from = current_date`) and a non-approver (role `educator` for the
class), each acting with `app.staff_id` set as the website does; the exception setting for `2031-32` listing 10. One check
per Done-when line; the LIVE line is a read-only count on the box (`check_box`): zero schools without both settings rows,
and `to_regclass` not null for both tables. Existing suites for "unchanged": `test_k2_timetable.py`,
`test_k2_timetable_load.py`, `test_timetable_run_command.py`, `test_k2_day.py`, `test_approval_list.py`; website journeys
`m1-09-activity`, `m1-09-calendar`, `m1-09-materials`, `m1-14a-timetable-rules`.

## Implementation list
- `supabase/migrations/<ts later than CP-6's>_fortnight_plan.sql`: tables, `access_table` rows, `needs_first`, redefined
  `approval_begins` and `approval_checked`, settings, the three functions, triggers (teaching fortnight, forbid delete,
  gate), grants; idempotent; ends with `select internal.apply_conventions()`. Timestamp chosen by the builder.
- `supabase/seed/vocabulary.json`: `approval_kinds` gains `timetable_line`.
- `packages/engine/engine/w2_print/cli_timetable.py`: the `draft` command (stays under 400 lines).
- `packages/engine/tests/test_cli_timetable.py` (new): the command's output.
- `workflows.json`: N4 `commands` gains `engine timetable draft`.
- `docs/notes/CP-7.md` at commit boundaries.
