# CP-7 design (lean): one approval per class per fortnight; an unchanged fortnight rolls forward

Status: LEAN revision, 9 Nov 2026, at Nimish's request ("keep the backend lean"; he typed UNLOCK CP-7). Third version: the
first two (per-week, then per-line approval) were reviewed by four fresh goldfish reviewers (`design-review/summary.md`);
every fix that still applies is kept. The lean version removes the parts those reviewers spent most findings on
(per-line tracking, carried approvals, removal handling, the ledger change). Not re-reviewed after this change.
Plan: `docs/backend-plan.md` row CP-7 (M1-06, its approval step). Tier 3: a migration.
Waits for CP-6, and through it for CP-3 and CP-4. No staff or child name appears here or in the proofs.

## Decided (Nimish, 8 and 9 Nov)
- The unit is the fortnight; weeks, days and periods are views, with no approval of their own.
- What is compared is the timetable grid (each period of weeks A and B: kind, subject, wording). The planner's words are
  locked by CP-6's freeze and are not re-approved.
- One yes per class per fortnight, from the coordinator or "Everything" group (a settings row; no further restriction).
- The fortnight cannot be marked approved (CP-6's step) until every class's fortnight is settled.
- Lean: the system does not say which periods changed and keeps no per-period approvals.

## What is cut, against the previous version
Per-line `changed` flags and approvals; `fortnight_line_decide` and `fortnight_approve_open`; send-back with reason;
carried approvals; "removed period" lines; the change to the shared approval ledger (`approval_checked`, `needs_first`,
`vocabulary.json`). What stays: the roll-forward comparison, exceptions, the group check, the CP-6 gate, draft only when
frozen, real dates, versioning.

## Dependencies (named)
Built after CP-6 merges (it waits for CP-4, which waits for CP-3). Proofs are written against `main` plus:
- **CP-6:** `fortnight_cycle(fortnight_id, state)` (`planning, frozen, aligned, approved, list_sent`) and its freeze.
- **CP-4:** `public.access_table(data_class, reason)`; the new table is listed `school_wide`.
- **CP-3:** the role-to-group rows. The approver check joins `public.current_staff()` to `staff_role_grant` and those rows.
If any is renamed before it merges, the builder runs `athena block CP-7`.

## Technical plan

### Data
- `fortnight_plan(id, tenant_id, school_class_id, fortnight_id, version int > 0, state in ('draft','approved',
  'rolled_forward'), baseline_id null references fortnight_plan, drafted_at, drafted_by, settled_at, settled_by,
  created_at, updated_at)`; unique (school_class_id, fortnight_id, version). Teaching fortnights only (trigger). The
  newest version counts.
- `fortnight_plan_line(id, tenant_id, fortnight_plan_id, week_code A|B, weekday, on_date, period_id, kind, subject_code,
  text, created_at, updated_at)`; unique (fortnight_plan_id, week_code, weekday, period_id). Weeks, days and periods are
  filters on these rows.
- Both tables: `internal.forbid_delete()`; app roles only read; written only by the two `security definer` functions.
- The approval is one row in the existing `approval` ledger: new kind `timetable_fortnight` needs the ledger's
  first-approval rule not to apply. Smallest way: the migration stores the decision on `fortnight_plan` itself
  (`settled_by`, `settled_at`) and writes no `approval` row. **Decision recorded here: no ledger row** (keeps the shared
  approval trigger untouched); Done-when 3 reads "one approval" as the one settled-by/settled-at stamp.
- Settings per school (in `internal.approval_begins`, redefined to keep its existing kinds and states):
  `fortnight.no_roll_forward` = `{"2026-27": [10, 11]}` and `fortnight.approver_groups` = `["<CP-3 code for Everything>"]`.
  A missing row raises.

### Rules (database functions; no application code decides)
1. `public.fortnight_draft(p_class uuid, p_fortnight uuid) returns uuid`:
   refused unless the cycle is `frozen` or `aligned` (read `for share`); advisory lock on (class, fortnight); lines for
   each school weekday of weeks A and B on its real date (Monday of the week holding `starts_on`, plus weekday - 1, plus
   7 for B), the class's slot valid on that date; two slots for one period, or none at all, raise. Baseline: the class's
   newest `approved`/`rolled_forward` version in an earlier teaching fortnight (`starts_on desc, version desc`). If a
   baseline exists, the fortnight is not an exception and every line equals the baseline's line at the same (week,
   weekday, period) (a missing line and an `empty` line are equal), the plan is `rolled_forward`, stamped. Otherwise
   `draft`. Rerun with the same baseline and equal lines writes nothing and returns the existing id.
2. `public.fortnight_approve(p_plan uuid) returns void`: locks the plan row `for update`; refuses unless it is the newest
   version and `draft`; the caller must be an approver (rule 3); sets `approved`, `settled_by` (`app.changed_by`, else the
   staff id), `settled_at`.
3. **Who** (inside `fortnight_approve`, and a trigger on `fortnight_plan` so a direct update is held to it too):
   `current_staff()` is an active staff member of the school with a role grant valid on `current_date` whose CP-3 group is
   in `fortnight.approver_groups`; else "only the approving group approves a fortnight". Functions are `security definer
   set search_path = public`; `fortnight_draft` executable by `app_engine`, `fortnight_approve` by `app_web` and
   `app_engine`; revoked from public, anon, authenticated.
4. **Gate** (new trigger on CP-6's `fortnight_cycle`, its own function): a move to `approved` is refused, naming the class,
   while any class with slots valid in that fortnight lacks a newest `fortnight_plan` in `approved`/`rolled_forward`
   whose lines still equal the current frame (re-derived by the draft's line function). No grade is named in code.

### Refusals (stems the proofs match; errcode)
| Refusal | Stem | errcode |
|---|---|---|
| draft outside `frozen`/`aligned` | `fortnight cannot be drafted: fortnight <n> is <state>` | 23514 |
| no slot in the fortnight | `fortnight has no timetable: class <id>` | 23514 |
| two slots for one period | `two slots for one period: class <id> <date> period <id>` | 23514 |
| not a teaching fortnight | `only a teaching fortnight is planned` | 23514 |
| caller not in the groups | `only the approving group approves a fortnight` | 42501 |
| plan not open | `fortnight is not open: <why>` | 23514 |
| direct write by an app role, or a delete | Postgres's own refusal | 42501 / P0001 |
| CP-6 gate | `fortnight <n> cannot be approved: class <id> is not settled` | 23514 |
| missing setting | `setting <key> is missing for this school` | 23514 |

### Engine
`engine timetable draft --fortnight N [--year 2026-27] --by <text> [--apply]` in `cli_timetable.py`, mirroring `load`
(dry run unless `--apply`; sets `app.changed_by` from `--by`); prints one line per class: `  <grade> <section>: rolled
forward` / `: waiting for approval`. No approve command until the screen scope. `workflows.json` N4 `commands` gains it.

## Alternatives considered
- **Per-week or per-line approval (earlier versions).** Dropped by Nimish for lean: the fortnight is the unit.
- **Compare the planner's words.** Rejected: locked by CP-6's freeze.
- **Approval row in the shared ledger.** Rejected by author for lean: its trigger refuses new kinds, and changing it
  touches C5; the stamp on the plan is enough for one yes.
- **Approver from `app.changed_by`.** Rejected: free text any session can set.
- **Drop roll-forward as well.** Rejected: one equality check keeps the coordinator's work down.

## Known gaps, named not fixed
- The coordinator is not shown which periods changed (a later screen can compute it from two versions' lines).
- No per-period record of who approved what; no send-back reason.
- A frame change after the fortnight is `approved` (allowed with a reason under CP-6) leaves a later draft waiting; it
  does not move the fortnight back (CP-6 decision 4).
- Approval does not change what educators see.

## Proofs
Database proofs on the throwaway Postgres (`TEST_DATABASE_URL`), rolled back, fixtures in academic year 2031-32 with
fortnights 9, 10, 11 and their `fortnight_cycle` rows; slots seeded while `planning`, then `frozen`; an approver (role
`coordinator`) and a non-approver (role `class_teacher`), each acting with `app.staff_id` set as the website does. LIVE
(`check_box`): zero schools without both settings rows; `to_regclass` of both new tables not null. Existing suites for
"unchanged": `test_k2_timetable.py`, `test_k2_timetable_load.py`, `test_timetable_run_command.py`, `test_k2_day.py`,
`test_approval_list.py`; website journeys `m1-09-activity`, `m1-09-calendar`, `m1-09-materials`, `m1-14a-timetable-rules`.

## Implementation list
- `supabase/migrations/<ts later than CP-6's>_fortnight_plan.sql`: two tables, `access_table` rows, redefined
  `approval_begins` (existing kinds and states kept) plus the two settings, `fortnight_draft`, `fortnight_approve`,
  triggers (teaching fortnight, forbid delete, approver, gate), grants; idempotent; ends with
  `select internal.apply_conventions()`. Timestamp chosen by the builder.
- `packages/engine/engine/w2_print/cli_timetable.py`: the `draft` command (stays under 400 lines).
- `packages/engine/tests/test_cli_timetable.py` (new): the command's output.
- `workflows.json`: N4 `commands` gains `engine timetable draft`.
- `docs/notes/CP-7.md` at commit boundaries.
