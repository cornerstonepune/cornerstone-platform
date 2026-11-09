# CP-25: The fortnight works end to end, plus the backend's basics

Status: reviewed (EGM, all stages; reports in `design-review/`), 9 Nov 2026. Scope: issue #530, copied verbatim to
`spec.md`. Tier 3 (database, `.github/`).

Builds on CP-24 (#514, not merged yet). CP-24 adds the keyed routes `/fortnight/state` and `/fortnight/move`
(`packages/engine/engine/api/routes/plan.py`), the nightly line in `engine live watch` and `fortnight_cycle.step_days`.
CP-25 reuses them. Its build starts only after #514 is on main.

## The Problem

What goes wrong for the school today (each point checked in the code on main, commit `e7b0c2e`):

1. **The fortnight stops after a timetable goes live.** Once a fortnight's timetable is put live, or a lesson is moved by
   hand, the system sees every lesson twice. It then refuses to draft the class's fortnight, to settle a class and to
   approve the fortnight.
2. **The rule for "which days are in a fortnight" is written in several places, and they disagree.** One copy counts
   from the Monday of the first week: for a fortnight that starts on a Wednesday it takes in two days before the start,
   and for a 15-day fortnight it drops the last day.
3. **A class's fortnight can be approved only by typing database commands**, and most actions that change the fortnight
   or the timetable do not check who is asking.
4. **Every deploy puts back settings the school changed.**
5. **Nobody is told when the night's rebuild or the voice clean-up stops running**, and the steps to put those two jobs
   on the server are not written in one place.
6. **The "engine logs" workflow publishes raw server output in a public repository**, and its comment wrongly says only
   the repository's members can read it.
7. **Printed sheets carry no school logo.**

## Goals

One per Done-when line, same numbers.

1. One automated test with made-up data runs the whole fortnight: draft the timetable, put it live, move a lesson, draft
   the class's fortnight, approve the class, approve the fortnight.
2. One function says which dates, and which week (A or B), a fortnight covers. Every other copy is removed.
3. The coordinator can step a fortnight on and approve each class without touching the database, by a command and by
   the website's engine route. Each action that changes the fortnight or the timetable is allowed only to the staff
   group the school chose for it.
4. A deploy keeps a setting the school changed, and still adds a new one.
5. The system reports a late night rebuild or a late voice clean-up; one page lists the server steps for both jobs.
6. The engine-logs workflow prints counts only, and its comment is true for a public repository.
7. Engine-made worksheets and print packs carry the school logo as the brand rules say (line 7 as narrowed, 9 Nov).

## Non-Goals

* Everything in the issue's out-of-scope list (`spec.md`).
* No new table. No change to a locked file of a merged spec (CP-6, CP-7, CP-12, CP-22).
* No new web screen.
* Timetable drafts made by FET (`engine timetable generate`) and plan-line links (`engine plan link`): they write a
  draft record and plan-line links, not the fortnight's timetable, so item 3's group rule does not apply to them.
* Thresholds and prompts stay overwritten by every deploy: only `config` rows are written by anything other than the
  loader (the website and engine commands), so only `config` can hold a school's change.

## Open Questions

None open. **Decided 9 Nov 2026: option A**, by the orchestrator under Nimish's blanket authority; issue #530's line 7
and Out of scope were edited before the lock. The question, for the record:

1. **Logo on parent reports.** The engine makes no parent-report document: it writes
   a text draft that the website shows, so there is nothing for the engine to put a logo on.
   * **(A, recommended)** Nimish edits Done-when 7 in the issue to "worksheets and print packs made by the engine carry
     the school logo as the pack's rules say; a parent-report document gets it when one is built". Reason: the logo
     belongs to a document, and the parent report's document will be the website's.
   * **(B)** The engine builds a parent-report PDF now. A new feature, roughly doubling item 7.

   A changes the wording of a Done-when line, so only Nimish can do it. The label went on with line 7 unchanged
   (9 Nov); the question was sent to the orchestrator for him the same day, and `athena lock` waits for his answer.
   Proof 7 is never written to pass merely because no parent-report document exists.

## Critical User Journeys (CUJs)

### CUJ 1: the fortnight, start to finish (item 1)
* **Given**: one school, one class with a standing timetable, a teaching fortnight starting in the future, a coordinator
  on the sign-in list in the groups the settings name, school days on record.
* **When**: the coordinator puts a ready draft live, moves one lesson by hand, steps the fortnight to frozen, drafts the
  class's fortnight, approves the class, steps to aligned, then to approved.
* **Then**: each step succeeds; the class's plan holds the moved lesson on its new date; the fortnight is `approved`.
  On main today the drafting step fails with "two slots for one period".

### CUJ 2: someone outside the group (item 3)
* **Given**: a member of staff with no current grant in the group a setting names.
* **When**: they try any action of the item 3 table, by command or by route.
* **Then**: refused, naming the group and the setting's key; nothing written except the access-log row every email
  lookup already writes; a route answers 403, a command exits 1 with "Nothing was written."

### CUJ 3: a school's setting survives a deploy (item 4)
* **Given**: one deploy has run since CP-25's migration; the school changed `timetable.link_band` (a row not marked
  `seed_once`).
* **When**: the next deploy loads the settings.
* **Then**: the school's value stays; a key added to the seed since is now present; a key the school never changed takes
  a new seed value.

## Technical Plan (Architecture)

Terms. The **frame** is a class's standing timetable: `timetable_slot` rows with `fortnight_id` null, by week (A/B),
weekday and period. A **layer** is a fortnight's own dated copy: `timetable_slot` rows with `fortnight_id` set and
`valid_from = valid_to =` one date. Going live (CP-22) writes a layer for every teaching date; the first hand move in a
fortnight (CP-12) copies the frame into a layer for the dates that have a calendar row. The frame is never edited. The
**day page** is the educator's day and week view (`w2_print/k2_day.py`). **Drafting the class's fortnight** is CP-7's
`fortnight_draft`: one `fortnight_plan` per class per fortnight, with one `fortnight_plan_line` per period of each
teaching date; it is what the scope calls "draft the week". **Approving a class** is `fortnight_approve` (CP-7, one
plan); **approving the fortnight** is the cycle step to `approved` (CP-6's states: planning, frozen, aligned, approved,
list_sent), which a database trigger (CP-7's gate) refuses while any class with a timetable is not settled. A **door** is
an engine command (`engine …`) or a **keyed route** (an HTTP route only callable with the engine's key, which the website
holds).

### Items 1 and 2: one rule for dates, one rule for which row holds a lesson

**Root cause of item 1 (confirmed in the code).** CP-7's `internal.fortnight_slots` (migration `20270125150000`) joins
every `timetable_slot` row valid on a date. It predates CP-22's layer, so once a layer exists each (date, period)
matches the frame's row and the layer's. `internal.fortnight_lines` raises "two slots for one period"; that stops
`fortnight_draft` and the cycle gate (through `fortnight_signature_of_slots`). The clash view and the day page already
prefer the layer; CP-7's reader does not.

**The copies of the date rule on main:**

| Copy | Where | Rule |
|---|---|---|
| CP-7 | `internal.fortnight_slots` (SQL) | Monday of the first week + weekday (+7 for B), minus campus holidays: takes days before a mid-week start, drops a 15th day |
| CP-12 | `public.timetable_fortnight_layer` (SQL) | each date `starts_on..ends_on`, Mon-Fri; A = first 7 days, B = the rest; needs a non-holiday calendar row |
| CP-12 | `timetable_clash` view (SQL) | the same, written again |
| CP-11/22 | `tt_need.load` (Python; `tt_live` uses its days) | the same dates and weeks; drops campus holidays; needs no calendar row |
| day page | `k2_day.py` line 65 (SQL in Python) | `on_date - starts_on < 7` → A |
| K2 planner | `k2_timetable._weeks` (Python) | Monday-based, as CP-7 |
| K2 planner load | `k2_timetable_load._parts` (Python) | `(d - start).days < 7` → A |

**The one rule**, `public.fortnight_days(p_class uuid, p_fortnight uuid)` → `(on_date date, week_code text, weekday
smallint, school_day_id uuid)`, `language sql stable`: every date from `starts_on` to `ends_on`, Monday to Friday, not a
holiday on the class's campus; week A is the first seven days from `starts_on`, B the rest; `school_day_id` is the date's
calendar row or null. It does not require a calendar row: CP-22's locked proof
`test_a_date_with_no_school_day_on_record_is_refused_and_named` needs a date with no row to reach go-live's own refusal.

**The one cell rule**, `public.fortnight_cells(p_class uuid, p_fortnight uuid)` → the `fortnight_days` columns plus
`slot_id, period_id, kind, subject_code, text`, `language sql stable`, decided **per date**: the layer's rows on that
date (matched by `valid_from = on_date` and `fortnight_id`), else the frame's rows for that date's week and weekday
valid on the date. Per date, not per fortnight, because a layer copied by a hand move skips dates with no calendar row;
a date the layer lacks was never moved (a move needs a calendar row), so the frame is right for it. This is the day
page's existing rule.

Readers moved onto them:
* `internal.fortnight_slots` becomes a select from `fortnight_cells` (signature unchanged). This fixes item 1.
* `public.timetable_fortnight_layer` and the `timetable_clash` view take their dates and cells from them, filtered
  `school_day_id is not null` (their existing condition, now stated once each, not a second date rule).
* `tt_need.load` selects its days from `fortnight_days`.
* `k2_day.py` gets the week from `fortnight_days` and its cells from `fortnight_cells`.
* `k2_timetable.generate` takes a `week_of` mapping from its caller instead of computing it; `k2_timetable_load` builds
  that mapping, and its `_parts` test, from `fortnight_days` (it has a connection).
* Hand moves (`tt_move`) read layer rows by date and period; they hold no copy of the rule.

**Two schema fixes the 15-day fortnight needs.** `fortnight_plan_line`'s unique key (plan, week, weekday, period)
refuses the 15th day (same week, weekday and period as the 8th): replaced by `fortnight_plan_line_plan_date_period_key
unique (fortnight_plan_id, on_date, period_id)`. `internal.fortnight_signature` orders by the whole formatted line, so
two such lines give one signature every time. Signatures are never stored: both sides of every comparison (plan vs
timetable, plan vs earlier plan) are computed by the same function at the same moment, so the gate and roll-forward
still agree. A 15-day fortnight never rolls forward from a 14-day one (it has more lines), which is correct.

### Item 3: who may, one rule in the database

* **One membership rule.** New SQL `internal.in_groups(p_tenant uuid, p_staff uuid, p_key text) returns boolean`
  (security definer, fixed `search_path`): the staff row is active, and holds a `staff_role_grant` valid on the school's
  day (`internal.school_day(tenant, now())`) in a role CP-3 maps (`access_role_group`) to a group the setting `p_key`
  names. The setting must be a string or a list of strings; missing or any other shape is false (refused).
  `internal.fortnight_is_approver` is redefined to call it for the signed-in staff row. One rule, one clock.
* **One door helper**, `packages/engine/engine/core/who_may.py` (core: it reads CP-3 tables and config, which every
  workflow may use):
  * `ACTIONS`: a dict, action name → setting key (the table below).
  * `as_actor(conn, staff_id, action) -> staff_id`: raises `NotInGroup` (status 403) unless `internal.in_groups` says
    yes; its message names the action, the group(s) and the key. Doors already turn an email into a staff id
    (`w1_bank/cli_map.staff_of` for commands, `w3_read/voice_intake.staff_of` for routes); `staff_of_email` returns null
    for an email on two staff rows, which those helpers refuse.
  * `as_signed_in(conn, staff_id)`: sets `app.staff_id` to that staff row's `signin_id` with `set_config(…, true)` (this
    transaction only), sets `app.changed_by` to the staff id, then checks `internal.resolve_staff()` returns exactly that
    staff id; raises `NotInGroup` when the row has no sign-in or is inactive. A coordinator must be on the website's
    sign-in list (`app.staff`) to approve a class: the database's check (`fortnight_approve`) is CP-3's.
* **Where the check sits: the doors.** Each door calls `as_actor` before the library call. Not inside the library:
  CP-6's locked proofs and three engine test files call `fortnight_cycle.move` and `draft_classes` with a free-text
  actor that holds no grant. A door cannot get a staff id for the library without `as_actor` (one place, one dict, one
  test walking it). The checks CP-22 and CP-12 already make inside `go_live` and `tt_clash.accept` stay, now through
  `internal.in_groups`; they gain the active-staff condition the database rule already had.
* **Approve a class.** The door calls `fortnight_cycle.approve_class(conn, grade, section, year, number, staff_id)`,
  which finds the class's newest plan and calls `fortnight_approve` inside `as_signed_in`. No separate Python group
  check: the database refuses (42501) and the door turns that into `NotInGroup`.
* **The clash rule for approving a fortnight** moves out of `cli_fortnight.approve` into
  `tt_clash.check_approval(conn, tenant_id, fortnight_id, number)`, raising `CycleError`, called by every door that steps
  to `approved`. It is not put inside `fortnight_cycle.move` because `tt_clash` imports `tt_live`, which imports
  `fortnight_cycle` (an import cycle).

| Action | Command | Route | Setting (default) |
|---|---|---|---|
| step the cycle | `engine fortnight move --to frozen\|aligned\|approved\|list_sent`; `engine fortnight approve` (kept) | `/fortnight/move` (CP-24) | `fortnight.step_group` (new, `["everything"]`) |
| draft the class's fortnight | `engine timetable draft` | none | `fortnight.step_group` |
| approve a class | `engine fortnight approve-class` (new) | `/fortnight/approve-class` (new) | `fortnight.approver_groups` (CP-7) |
| put a draft live | `engine timetable go-live` | none | `timetable.go_live_group` (CP-22) |
| move a lesson by hand | `engine timetable move` | `/timetable/move` | `timetable.change_group` (new, `["everything"]`) |
| change a timetable rule | none | `/timetable/rules/change` | `timetable.change_group` |
| load the standing timetable | `engine timetable load --apply` (gains `--by`) | none | `timetable.change_group` |
| accept a clash | `engine timetable accept` | `/timetable/clash/accept` | `timetable.accept_clash_group` (CP-12) |

`everything` is the coordinator's group (Nimish, 8 Nov 2026, recorded in `docs/backend-plan.md`). Interface change:
`engine timetable draft --by` was a staff id written as "who drafted"; it becomes an email like every other `--by`, and
the resolved staff id is what is written. Its one caller outside the engine is `test_cli_timetable.py`.

### Item 4: a setting the school changed is kept

`config` gains `seed_value jsonb` (what the loader last wrote). For a seed row not marked `seed_once`, `load_config`:
* new key: inserted with `value` and `seed_value` = the seed;
* `seed_value` is null (a migration or a new-school trigger made the row; the loader never wrote it): `value` = the seed;
* live `value` = `seed_value` (jsonb comparison; the school has not changed it): `value` = the seed;
* otherwise (the school changed it): `value` kept; the loader prints the key's name (never the value);
* always: `seed_value` and `description` = the seed's.

`seed_once` rows are untouched, as today. The first deploy after the migration writes the seed, as every deploy does
today; from then on a school's change is kept. A value the school changes before that first deploy is lost once, as
today; the runbook tells the school to re-set it after the deploy. If the engine is rolled back to an old loader, rows
it writes keep their old `seed_value` and later read as "school-changed": the rollback note says to clear `seed_value`
after such a rollback.

### Item 5: late jobs

The scope's "48-hour voice clean-up" is the job that deletes a note's raw copies 48 hours after it arrives
(`voice.confirm_within_hours`); n8n runs it every hour (`n8n/workflows/f5-voice-cleanup.json`). So "late" is three hours
without an ok run. CP-24 adds the nightly line (CP-9's `graph.nightly_stale_hours`, 26). CP-25 adds in `watch.problems`:
`voice clean-up has had no ok run for {n} hours (limit {h})`, or `voice clean-up has never run ok`, reading the newest
`flow_run` with `flow = 'voice_cleanup'` and `status = 'ok'` (the query `voice_switch.status` already uses). The limit is
a threshold row, `watch.voice_cleanup_hours` = 3, as the watch's other limits are (`supabase/seed/thresholds.json`; no
migration lines). `docs/runbooks/scheduled-jobs.md`: import F4 and F5 into n8n on the server, attach the engine-key
credential, switch both on, confirm with `engine live watch`; it links `n8n/README.md` for each workflow's detail.

### Item 6: engine logs

Every step that prints raw text is removed or replaced by a count: the container log tail becomes counts of lines by
level and by HTTP status in a window (input `minutes`, default 60, replacing `lines`); the kernel lines become a count;
process arguments, run error text and the misconception rows are removed; each `.github/measure/*.py` the workflow runs
prints counts only (changed where it does not). The header comment says: on a public repository anyone can read a
workflow run's log, so this workflow prints counts and never a log line.

### Item 7: the logo

Every worksheet and pack page is drawn by `assess/render.render_sheet` (`sheet_html`'s header); packs only merge those
PDFs. The lockup-colour SVG from #528 (`docs/brand/cornerstone-logo/SVG-vector/Cornerstone-logo-lockup-colour.svg`) is
read once and inlined in the header, on white, unrecoloured, with the brand README's clear space, **in the box the
school's name text takes today**, at the same height. The page geometry does not move, so no new print layout row is
needed (ADR 0040: a layout change is a new row) and copies already printed are still read in their own layout. The
scanner's existing tests on a rendered sheet must pass unchanged.

## Alternatives Considered

* **Item 1: delete or end the frame's rows while a layer exists.** Rejected: CP-22 locked "the frame is never touched",
  and two readers already rely on layer-over-frame.
* **Item 1: layer-or-frame per fortnight.** Rejected: a layer copied by a hand move skips dates with no calendar row;
  per fortnight those dates would silently drop out of the plan.
* **Item 2: keep the Monday rule and change the others.** Rejected: five of seven copies count A as the first seven
  days, and the Monday rule takes days before a mid-week start.
* **Item 3: the check inside each library function.** Rejected: it breaks CP-6's locked proofs (free-text actor).
* **Item 3: a database trigger per action.** Rejected: seven triggers, each needing the signed-in staff id inside the
  database session, which the engine sets today only for `fortnight_approve`.
* **Item 4 (a): never overwrite a value.** Rejected: a value developers change in the seed (for example
  `people.decides`, which a test says must reach live with a deploy) would never arrive.
* **Item 4 (b): mark the row "school's" in every writer.** Rejected: many writers; missing one loses a school's change.
* **Item 5: an n8n error workflow.** Rejected: n8n never thinks (CLAUDE.md rule 3), and a job that never starts raises no
  error.
* **Item 7: a new print layout with a taller header.** Rejected: a new layout row and new geometry for no gain.

## Risks & Mitigations

1. **The journey crosses five scopes; a second fault may sit behind the first.** The journey test is written first and
   run after every step of the build.
2. **Plans drafted under the old date rule.** Fortnights that do not start on a Monday or are not 14 days get new dates;
   an approved plan for one would fail the gate. Mitigation: before deploy, a read-only query on the server lists open
   fortnights (state frozen or aligned) that are not Monday-start 14-day; any listed are redrafted after the migration
   (runbook step).
3. **The old unique key has a generated name over 63 characters.** The migration finds it in `pg_constraint` by table
   and columns and drops it; adds the new key only if absent; the 15-day test runs on the migrated schema.
   `checks/rules.json` is regenerated (`engine live rules --write`), or the live watch reports drift.
4. **Route identity is as strong as the engine key.** Any holder of the key can send any `actor`; only the website and
   n8n hold it, and n8n's workflows call only `/graph/nightly` and `/voice/cleanup`. A command's `--by` is typed by the
   operator; command checks guard honest operators, not database-credential holders. Accepted, recorded here.
5. **A missing or malformed group setting.** Fails closed (refused), naming the key; tested.
6. **The K2 planner copies (`k2_timetable`, `k2_timetable_load`)** compute weeks for the school's spreadsheet load; on
   a Monday-start fortnight the answer is unchanged. If a planner test depends on the Monday rule for a mid-week date,
   the build reports it rather than bending the rule.
7. **The logo near what the scanner reads.** Same box as the name text, same height; the scanner's tests decide.
8. **CP-24 not merged.** Its route and watch functions are prerequisites; the build waits.

## Non-Functional Requirements

* Privacy: no name, email, value of a setting or raw log text in any watch line, workflow output, refusal or log. A
  refusal names a group and a key. The repository is public.
* Rollout: one migration, `20270125200000_the_fortnight_end_to_end.sql`, after main's newest and CP-24's (confirm at
  branch time; renumber if main has moved). Safe to run more than once.
* Rollback: the key swap can be reversed while no 15-day fortnight has been drafted; after an engine rollback, clear
  `seed_value` (item 4).

--------------------------------------------------------------------------------

## Detailed Implementation Plan

### Order of work
1. #514 merged; branch from main; confirm the migration number.
2. Write `test_fortnight_journey.py` (fails: "two slots for one period"). Until step 4, it approves through
   `fortnight_approve` with `app.staff_id` set in the test and steps with `fortnight_cycle.move`; at step 4 it switches
   to the doors.
3. Items 1 and 2: migration (functions, readers, key swap, signature), `tt_need`, `k2_day`, `k2_timetable(_load)`,
   `rules.json`.
4. Item 3: `in_groups`, `who_may`, then each door, `approve_class`, the two commands and the route.
5. Items 4, 5, 6.
6. Item 7 after #528 merges (and Open Question 1 settled).

### Target files

| # | Path | C/M | Change |
|---|---|---|---|
| 1 | `supabase/migrations/20270125200000_the_fortnight_end_to_end.sql` | C | `fortnight_days`, `fortnight_cells`, `in_groups`; redefined `fortnight_slots`, `fortnight_signature`, `fortnight_is_approver`, `timetable_fortnight_layer`, `timetable_clash`; key swap by `pg_constraint` lookup; `config.seed_value`; settings `fortnight.step_group`, `timetable.change_group` per school and on a new school (as `internal.timetable_hand_settings`); revoke from public/anon/authenticated, execute to `app_engine` (and `app_web` for the two read functions, which the website's `security_invoker` clash view calls); `select internal.apply_conventions();` |
| 2 | `packages/engine/engine/core/who_may.py` | C | `ACTIONS`, `NotInGroup(status=403)`, `as_actor`, `as_signed_in` |
| 3 | `packages/engine/engine/w2_print/tt_live.py` | M | `in_group` removed; `go_live` calls `who_may.as_actor(conn, who, "go_live")` |
| 4 | `packages/engine/engine/w2_print/tt_clash.py` | M | `accept` uses `who_may`; new `check_approval` |
| 5 | `packages/engine/engine/w2_print/tt_need.py` | M | days from `fortnight_days` |
| 6 | `packages/engine/engine/w2_print/k2_day.py` | M | week and cells from the two functions |
| 7 | `packages/engine/engine/w2_print/k2_timetable.py`, `k2_timetable_load.py` | M | `_weeks` removed; `week_of` passed in, built from `fortnight_days` |
| 8 | `packages/engine/engine/w2_print/fortnight_cycle.py` | M | `approve_class` |
| 9 | `packages/engine/engine/w2_print/cli_fortnight.py` | M | `approve` uses `as_actor` + `check_approval`; new `move` (`--year`, `--fortnight`, `--to`, `--by`) and `approve-class` (`--year`, `--fortnight`, `--grade`, `--section`, `--by`) |
| 10 | `packages/engine/engine/w2_print/cli_timetable.py` | M | `draft` `--by` email + `as_actor`; `load --apply` gains `--by` + `as_actor`; `go-live` unchanged except the helper |
| 11 | `packages/engine/engine/w2_print/cli_tt_hand.py` | M | `move` calls `as_actor(…, "move_lesson")`; `NotInGroup` → exit 1 |
| 12 | `packages/engine/engine/api/routes/plan.py` | M | `/fortnight/move` calls `as_actor` (+ `check_approval` for `approved`); new `/fortnight/approve-class`, body `{actor, grade, section, year, fortnight}`, returns `{state}`; `NotInGroup` → 403 |
| 13 | `packages/engine/engine/api/routes/timetable_hand.py`, `timetable_rules.py` | M | `as_actor` on move and change; `NotInGroup` → 403 before the generic refusal |
| 14 | `packages/engine/engine/core/settings.py` | M | `load_config` as item 4 |
| 15 | `packages/engine/engine/checks/watch.py`, `supabase/seed/thresholds.json` | M | clean-up line; `watch.voice_cleanup_hours` = 3 |
| 16 | `supabase/seed/config.json` | M | `fortnight.step_group`, `timetable.change_group` = `["everything"]`, `seed_once: true` |
| 17 | `packages/engine/engine/checks/rules.json` | M | regenerated |
| 18 | `.github/workflows/engine-logs.yml`, `.github/measure/*.py` (those that print per-row lines) | M | item 6 |
| 19 | `docs/runbooks/scheduled-jobs.md` | C | item 5 (and item 4's re-set note, risk 2's query) |
| 20 | `packages/engine/engine/assess/render.py` | M | logo in `sheet_html`'s header; `workflows.json`'s frozen lint counts for this file must not rise |
| 21 | `workflows.json` | M | `engine/core/who_may.py` on the base; `engine fortnight move` and `engine fortnight approve-class` on N4's commands (routes are not in the map) |

Tests: `packages/engine/tests/test_fortnight_journey.py` (C), `test_fortnight_days.py` (C), `test_who_may.py` (C),
`test_loaders.py` (M), `test_watch.py` (M), `test_cli_timetable.py` (M: `--by` email), `test_render.py` (M); the proofs
in `specs/CP-25/` (written by the proof-writer, not the builder).

### Done-when → what proves it

| # | Proof (failing on main today) |
|---|---|
| 1 | the journey on one fake fortnight, by the doors, ends `approved` with the moved lesson in the class's plan |
| 2 | `fortnight_days` for a 14-day Monday-start, a 15-day and a Wednesday-start fortnight gives exactly their weekdays minus holidays, weeks A/B by the first seven days; drafting each gives lines on exactly those dates; no other copy of the rule remains in the code |
| 3 | for each action of the table, by each door it has: a group member succeeds, a non-member and an inactive member are refused (403 / exit 1) and nothing is written; a missing setting refuses |
| 4 | after one load, a changed non-`seed_once` value survives a second load; a new seed key is added; an untouched key takes a changed seed |
| 5 | the watch reports no run, an old ok run, only error runs; is quiet after a recent ok run; the runbook exists with the steps; LIVE: box-only read that both jobs have an ok run inside their limits |
| 6 | the workflow and the scripts it runs print no raw log line (no `docker logs`, `journalctl`, `dmesg` or `tail` reaching the output except through a count), and its comment says the log is public |
| 7 | a rendered worksheet and a print pack carry the lockup SVG in the header, unrecoloured; the scanner's tests pass |

### Verification
`cd packages/engine && pytest -q`; `bin/check --db` with `TEST_DATABASE_URL` on a local Postgres; `engine load --check`;
`bash specs/CP-25/checks.sh`; `athena done` for CP-6, CP-7, CP-12 and CP-22 still green. LIVE (after deploy, box only):
item 5's read.

### Which merged proofs and tests are touched
* Dates: every drafting fixture (CP-7, `test_fortnight_plan`) is a Monday-start 14-day fortnight, so unchanged. CP-12
  and CP-22 (15-day cases, a Tuesday-start neighbour) already use the first-seven-days rule. CP-22's "no school day on
  record" proof is kept (no calendar row needed). No test names the plan line's key.
* Groups: CP-6's proofs, `test_fortnight_cycle.py`, `test_k2_timetable_load.py` call the library with a free-text actor:
  kept green by checking at the doors. `test_cli_timetable.py` drives the `draft` command with `--by staff:<uuid>`:
  updated to a coordinator's email (item 3's intended change; not a locked file). CP-7, CP-12, CP-22 act as a
  coordinator in `everything`: unaffected.
* Settings: `test_loaders.py` covers `seed_once` only; CP-10's proof conftest loads config on a fresh school, kept by
  "null `seed_value` takes the seed".
* No test drafts after a go-live or a hand move: the journey is new coverage.
