# CP-7 design: the week inside the fortnight (draft, approve only what changed, roll forward)

Status: REVISED after a goldfish review (4 fresh reviewers: design, codebase-details, zoom-out, implementation-readiness;
findings and what was applied in `design-review/summary.md`). Draft for Nimish; not locked.
Plan: `docs/backend-plan.md` row CP-7 (roadmap task M1-06, the approval step it never got). Tier 3: a migration.
Waits for CP-6 (the fortnight cycle), and through it for CP-3 and CP-4. No staff or child name appears here or in the
proofs; "who" is a staff id.

## The problem
The K2 timetable is generated from the school's two-week frame (week A, week B) and the Monthly Planner, and loaded
straight into the tables the educators' screens read. Nobody approves it: the reconciliation of 8 Nov found "no approval
step at all" (M1-06). Its goalpost: *a drafted week that matches last week writes no approval; one changed line writes
exactly one; FN10 and December 2026 are stored as named exceptions.* Decision D-018, as quoted in
`docs/notes/m1-06-k2-plan-timetable.md` (d), says an unchanged week rolls forward with no approval.

## Two readings of "last week" and "a line" (decision 1)
The goalpost can be read two ways; both are written down and Nimish chooses.

| | (a) Grid: compare with the last settled week | (b) Content: compare with this week's last draft |
|---|---|---|
| "Last week" | the same week letter (A with A, B with B) of the class's last settled fortnight | the previous draft of this same week (same dates) |
| "A line" | one period on one weekday: kind, subject and the frame's wording (`timetable_slot`) | one Monthly Planner line, with every period it was placed in (`k2_timetable.changed` precedent, `test_k2_timetable.py`) |
| A new fortnight | rolls forward unless the grid changed; the planner's words are not approved by anyone here | every planner line of the week is new, so every one needs approval (roughly 20 to 25 a week for the one K2 class; approximate, from 375 lines over 8 fortnights) |
| A rerun after an edit | only changed grid periods need approval | only the edited planner line needs approval |
| The named exceptions (FN10, December) | meaningful: in them every period needs a person | redundant: every first draft already needs a person |

Recommendation: **(a), the grid.** Reasons: the goalpost's exceptions only make sense under (a); the planner's words are
the school's own Monthly Planner, copied and never written by the system, and CP-6's freeze already refuses a quiet
change to them; (b) turns into a full content review every fortnight, which the goalpost ("approve only what changed")
does not ask for. What Nimish gives up with (a): no person signs off the planner text inside the system. The rest of this
design is written for (a); if Nimish picks (b), the line unit and the comparison change (named in the scope) and the
exceptions setting is dropped.

## Reading the school's own words (fortnight first, Nimish 8 Nov)
- The planning unit is the **fortnight**; it has **week A** and **week B**. A week here is week A or B of one teaching
  fortnight, for one class.
- Each line is anchored to its real date: the Monday of the week containing the fortnight's `starts_on`, plus
  (weekday - 1), plus 7 for week B. So FN11 (starting on a Tuesday, 8 Dec) and FN10 (15 days) are read correctly, and a
  slot that starts mid-week is seen on its own day.
- "FN10 and December 2026" become fortnights of 2026-27: FN10 (the first generated) and FN11 (8 to 20 Dec, December
  2026's only teaching fortnight, `Graph_2026-27`). Stored per academic year, so they do not repeat next year by accident.

## Goals
1. Drafting a week records its lines and which changed against the last settled week of the same letter.
2. A week with no changed line is rolled forward and writes no approval.
3. Each changed line gets a person's decision, one approval row per decision.
4. Drafting an unchanged week again writes nothing.
5. A fortnight cannot reach CP-6's `approved` step while any of its weeks is unsettled (decision 2).

## Non-goals
Any screen (the approve button, the coordinator's list). **Approval does not hide or change anything educators see
yet:** their day, week and period show the timetable whether or not its week is approved. Moving a fortnight on its
date. The materials list (CP-17, CP-18). The FET generator (CP-11). Reminders.

## Dependencies (named)
CP-7 is built after CP-6 merges; CP-6 waits for CP-4, which waits for CP-3. One at a time. Proofs are written against
`main` plus exactly these:
- **CP-6:** `fortnight_cycle(fortnight_id, state)`, states `planning, frozen, aligned, approved, list_sent`; its freeze on
  `timetable_slot` and `plan_entry` (CP-7 adds no gate on them).
- **CP-4:** `public.access_table(data_class, reason)`; `internal.apply_conventions()` raises for an unlisted table. Both
  new tables are listed `school_wide` (reason: holds no child data).
- **CP-3:** the group rows (role code to group). The approver check joins `public.current_staff()` to
  `staff_role_grant` and CP-3's role-to-group rows. CP-3's design fixes the table and group-code names; the builder uses
  them as merged.
- If any of these are renamed before they merge, the builder runs `athena block CP-7`. Until CP-6 is on `main`, the
  proofs touching `fortnight_cycle` fail loudly: that is the dependency, not a bug.

## What exists (read from the repository)
- `timetable_slot(school_class_id, period_id, week_code, weekday 1..5, kind, subject_code, text, valid_from, valid_to)`,
  temporal, no overlap constraint. `fortnight(academic_year_id, kind, number, starts_on, ends_on)`; number unique per
  year only. `period.fixed` marks the seven daily rows.
- `approval` ledger (`20261208090000_one_approval_list.sql`): append-only; `approval_kind` per school, seeded by
  `internal.approval_begins(tenant)` and a tenant trigger. **`internal.approval_checked()` (lines 133-154) treats every
  `approved` row as a second approval and raises for any kind not in `approval_list`**, so it must change (rule 5).
- `public.current_staff()` (`20270112090000_current_staff.sql`): the signed-in staff id from `app.staff_id`, null when
  not a uuid; the website sets it at sign-in. `app.changed_by` is free text and is used only for "by".
- `internal.apply_conventions()` adds an `updated_at` touch trigger to every table; `internal.forbid_delete()` refuses
  deletes and keeps updates.
- `engine timetable load` (`w2_print/cli_timetable.py`, 158 of 400 lines; workflow W2 step N4; default `--year 2026-27`).
- `week_plan` and `timetable_version` were planned in M1-06 for "the approval step"; a versioned `week_plan` replaces
  both.

## Technical plan

### Data (the names are the contract the proofs use)
- `week_plan(id, tenant_id, school_class_id, fortnight_id, week_code A|B, version int > 0, state in ('draft',
  'approved','rolled_forward'), baseline_id null references week_plan, drafted_at, drafted_by, settled_at, settled_by,
  created_at, updated_at)`; unique (school_class_id, fortnight_id, week_code, version). Fortnight must be teaching
  (trigger). The newest version of a week is the one that counts.
- `week_plan_line(id, tenant_id, week_plan_id, on_date, weekday, period_id, kind, subject_code, text, changed boolean,
  approval_id null references approval, created_at, updated_at)`; unique (week_plan_id, weekday, period_id).
- Both: `internal.forbid_delete()`; no insert/update/delete for `app_web` or `app_engine`: written only by the two
  `security definer` functions below.
- `approval_kind` gains `needs_first boolean not null default true`; the new kind `timetable_week_line` ("a changed line
  of a week's timetable", `reaches_parent` false, `needs_first` false). `approval.target` = the line id as text. Not
  added to the `approval_list` view (the coordinator's list is a later screen).
- Settings per school: `week.no_roll_forward` = `{"2026-27": [10, 11]}` (academic year label to fortnight numbers) and
  `week.approver_group` = `{"group": "<CP-3's code for Everything>"}`. A missing row raises; it is never read as empty.
- `internal.approval_begins(tenant)` is redefined to keep its three kinds and four states and add the new kind and the
  two settings, so every school, present and future, has them.

### The rules (database functions and triggers; no application code decides)
1. **Draft** `public.week_draft(p_class uuid, p_fortnight uuid, p_week text) returns uuid` (the newest version's id):
   - Refused unless the fortnight's cycle is `frozen` or `aligned` (read `for share`): drafting a week whose frame can
     still change without a reason would approve a moving target.
   - Advisory lock on (class, fortnight, week).
   - Lines: for each weekday's real date, the class's `timetable_slot` rows of that week letter and weekday valid on that
     date. More than one slot for a period on a date raises, naming the class, date and period. No slot at all for the
     week raises, naming the class and week (a week never rolls forward empty).
   - Baseline: the newest `approved` or `rolled_forward` version of the same class and week letter in an earlier teaching
     fortnight, ordered by `starts_on desc, version desc`.
   - Changed: every line, when there is no baseline or the fortnight's number is listed for its year in
     `week.no_roll_forward`. Otherwise a line is changed when the baseline's line at that weekday and period differs in
     kind, subject or text. A baseline period with no line now is recorded as a changed line of kind `empty`; in later
     comparisons, no line and an `empty` line are equal, so a removal is approved once and not again.
   - Rerun: if the week's newest version has the same baseline and equal lines, nothing is written; its id is returned.
   - Otherwise a new version is written. A line equal to an approved line of the previous version of this week (same
     baseline) carries that `approval_id`, so a fix after a send-back does not ask for the other lines again.
   - No line left needing approval: `rolled_forward` if nothing changed, `approved` if every changed line carried an
     approval; both stamp `settled_at`/`settled_by`. Else `draft`.
2. **Decide** `public.week_line_decide(p_line uuid, p_decision text, p_reason text default null) returns void`:
   - Locks the week (`for update` on its `week_plan` row) and re-checks: newest version, state `draft`, line `changed`,
     line not yet approved.
   - Writes exactly one `approval` row (kind `timetable_week_line`, target the line id, `by` = `app.changed_by` text,
     else the staff id). `approved` sets the line's `approval_id`; `sent_back` needs a reason (the ledger refuses one
     without) and leaves the line open; it can still be approved later.
   - When no changed line is left open, the week becomes `approved`, stamped with who and when.
3. **Approve the rest** `public.week_approve_open(p_week_plan uuid) returns int`: the same checks, then one `approval`
   row per open changed line (count returned). One action for the coordinator in an exception fortnight, still one row
   per line.
4. **Who may decide** (in `internal.approval_checked`, so a direct insert into `approval` is held to it too): for kind
   `timetable_week_line`, `current_staff()` must hold a current role grant whose CP-3 group is `week.approver_group`;
   otherwise it raises "only the approving group decides a week's line". The functions are `security definer set
   search_path = public`; `week_draft` executable by `app_engine`; `week_line_decide` and `week_approve_open` by
   `app_web` and `app_engine`; revoked from public, anon and authenticated.
5. **Ledger fix** (`internal.approval_checked`, C5's function, redefined): the second-approval check runs only for kinds
   with `needs_first`; existing kinds behave exactly as before (a proof keeps it so).
6. **Gate on the fortnight** (decision 2; a new trigger on CP-6's `fortnight_cycle`, its own function; CP-6's functions
   are not edited): a move to `approved` is refused, naming the class and week, while any class with `timetable_slot`
   rows valid in that fortnight lacks, for week A and for week B, a newest `week_plan` in `approved` or
   `rolled_forward` whose lines still equal the current frame (re-derived by the same function the draft uses). No grade
   is named in code.

### Flow
```
frame (timetable_slot) --week_draft--> week_plan vN (lines; changed vs last settled A/B)
                                        | nothing changed        -> rolled_forward (no approval)
                                        | n changed lines        -> draft --decide x n / approve_open--> approved
fortnight_cycle: aligned -> approved    refused until every week of the fortnight is settled and matches the frame
```

### Engine
- `engine timetable draft --fortnight N [--year 2026-27] --by <text> [--apply]` in `cli_timetable.py`, mirroring `load`:
  a dry run (rolled back) unless `--apply`; sets `app.changed_by` from `--by` (as `loaders.py` does); calls `week_draft`
  for every class with slots in fortnight N of that year, weeks A and B; prints one line per week, verbatim
  `  <grade> <section> week <A|B>: rolled forward` / `: approved` / `: <n> lines waiting`. No approve command: deciding
  is a person's act through the database functions until the screen exists.
- `workflows.json` N4: `commands` gains `engine timetable draft`.

## Alternatives considered
- **(b) Compare content with the week's last draft.** Kept as decision 1's other option, not rejected.
- **Approve a whole week with one row.** Rejected by author: the goalpost is one approval per changed line.
- **Recompute the baseline from `timetable_slot` history instead of storing lines.** Rejected by author: a slot changed
  in place (allowed with a reason under CP-6) rewrites history, so an approved week would silently change.
- **Compare week B with the week A just before it.** Rejected by author: A and B differ by design; every period flags.
- **Week state on `fortnight_cycle`.** Rejected by author: the fortnight has one state for all classes; weeks are per class.
- **Approver identity from `app.changed_by`.** Rejected by author: it is free text any session can set.
- **A `superseded` state and an `exception` column.** Rejected by author (zoom-out): the newest version wins, and the
  setting gives the exception.

## Decisions for Nimish (only those the school would see)
1. **What the coordinator approves:** (a) only changes to the timetable grid, against the last approved fortnight
   (recommended, reasons above); or (b) the periods' content, every planner line of every new fortnight.
2. **The fortnight cannot be marked approved until all its weeks are settled.** Recommend yes: otherwise the week
   approval has no consequence. If no, Done-when 8 and rule 6 are dropped.

## Mechanical choices (decided here, with the reason)
- Who approves: a setting, default CP-3's "Everything" group (coordinator, deputy coordinator, mentor, head, curriculum
  team, ops). Nimish can change the row without code; said to him in one line.
- Exceptions: per academic year, default 2026-27 Fortnights 10 and 11, so next year starts clean.
- Fixed daily rows (settling, lunch, bus) are lines like any other: a moved lunch is a change. `week_approve_open` keeps
  an exception fortnight to one action.
- Versions, not edits; approvals carried onto identical lines; the newest version counts.
- Draft only in `frozen` or `aligned`; the gate re-derives the frame, so a stale approval never passes.
- No week is drafted automatically; a person (or a later n8n flow calling the command) runs it.

## Known gaps, named not fixed
- A frame change after the fortnight is `approved` (possible with a reason under CP-6) leaves a later draft waiting;
  it does not move the fortnight back (CP-6 decision 4: no way back).
- Approval does not change what educators see (non-goal).
- `approval_list` (the coordinator's list) does not show week lines until the screen scope adds them.

### Refusals (message stems the proofs match; errcode)
| Refusal | Stem | errcode |
|---|---|---|
| draft outside `frozen`/`aligned` | `week cannot be drafted: fortnight <n> is <state>` | 23514 |
| no slot in the week | `week has no timetable: class <id> week <A\|B>` | 23514 |
| two slots for one period | `two slots for one period: class <id> <date> period <id>` | 23514 |
| not a teaching fortnight | `only a teaching fortnight has weeks` | 23514 |
| caller not in the group | `only the approving group decides a week's line` | 42501 |
| line not changed / not newest draft / already approved | `line is not open: <why>` | 23514 |
| direct delete, or write by an app role | Postgres's own refusal (`forbid_delete`; no privilege) | 42501 / P0001 |
| fortnight gate | `fortnight <n> cannot be approved: class <id> week <A\|B> is not settled` | 23514 |
| missing setting | `setting <key> is missing for this school` | 23514 |

"Who is in the group": `current_staff()` is a `staff.id` of the line's school, `active`, holding a `staff_role_grant`
valid on `current_date` whose role maps (CP-3's rows) to the group in `week.approver_group`. Unset or not a uuid is the
same refusal as a non-member. One approval row per call; an approved line has exactly one `approved` row; a sent-back
line stays decidable on the same version until a newer version replaces it.

## Proofs (written by the proof-writer after the lock)
Database proofs on the throwaway Postgres (`TEST_DATABASE_URL`), rolled back, as CP-6's are. Fixtures: an academic year
`2031-32` with teaching fortnights numbered 9, 10 and 11 and their `fortnight_cycle` rows; slots seeded while the cycle
is `planning`, then the cycle moved to `frozen`; a member (role `coordinator`, `valid_from = current_date`, the class's
campus) and a non-member (role `educator` for the class), each acting with `app.staff_id` set as the website does; the
exception setting for `2031-32` listing 10. One check per Done-when line; the LIVE line is a read-only count on the box
(`check_box`): zero schools without both settings rows, and `to_regclass` not null for both tables.
Existing suites for "unchanged": `test_k2_timetable.py`, `test_k2_timetable_load.py`, `test_timetable_run_command.py`,
`test_k2_day.py`, `test_approval_list.py`; website journeys `m1-09-activity`, `m1-09-calendar`, `m1-09-materials`,
`m1-14a-timetable-rules`.

## Implementation list
- `supabase/migrations/<ts later than CP-6's>_week_plan.sql`: tables, `access_table` rows, `needs_first`, redefined
  `approval_begins` and `approval_checked`, settings, the three functions, triggers (teaching fortnight, forbid delete,
  gate), grants; idempotent; ends with `select internal.apply_conventions()`. Timestamp chosen by the builder.
- `packages/engine/engine/w2_print/cli_timetable.py`: the `draft` command (stays under 400 lines).
- `packages/engine/tests/test_cli_timetable.py` (new): the command's output, one test file per module.
- `supabase/seed/vocabulary.json`: `approval_kinds` gains `timetable_week_line` (ord 3), so `engine load` and
  `test_approval_list.py` agree with `approval_begins`.
- `workflows.json`: N4 `commands` gains `engine timetable draft`.
- `docs/notes/CP-7.md` at commit boundaries.
