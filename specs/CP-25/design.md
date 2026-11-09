# CP-25: The fortnight works end to end, plus the backend's basics

Status: draft for review (EGM), 9 Nov 2026. Scope: issue #530 (copied verbatim to `spec.md`). Tier 3.
Builds on CP-24 (#514, not yet merged): its keyed routes `/fortnight/state` and `/fortnight/move`
(`engine/api/routes/plan.py`), its nightly line in `engine live watch` and its `step_days` helper are reused, not
rebuilt. CP-25's build starts only after #514 is on main.

## The Problem

Each piece of the fortnight works alone, but the journey breaks. Read in the code on main (`e7b0c2e`), not taken from
the reviewers:

**Root cause of item 1 (confirmed).** CP-22 made a live fortnight a *layer* of dated `timetable_slot` rows
(`fortnight_id` set, `valid_from = valid_to = the date`) on top of the standing *frame* (`fortnight_id` null,
`valid_to` null), which is never touched. CP-12's first hand move copies the frame into the same kind of layer. CP-7's
`internal.fortnight_slots` (migration `20270125150000`) predates the layer: it joins every `timetable_slot` row valid
on a date, so once a layer exists each (date, period) matches two rows, the frame's and the layer's.
`internal.fortnight_lines` then raises "two slots for one period", which stops `fortnight_draft` (drafting the week)
and also the approval gate on `fortnight_cycle` (`fortnight_signature_of_slots` calls the same function). So after a
go-live or a hand move the week cannot be drafted, a class cannot be settled, and the fortnight cannot be approved.
The CP-12 clash view already reads "the layer when there is one, else the frame"; CP-7 is the one reader that does
not.

**A second fault on the same road: four copies of the date rule.**
| Copy | Where | Rule |
|---|---|---|
| CP-7 | `internal.fortnight_slots` | the Monday of the week holding `starts_on`, plus the weekday, plus 7 for week B: always ten dates, which for a fortnight starting mid-week includes days before it starts, and for a 15-day fortnight drops the last day |
| CP-12 | `public.timetable_fortnight_layer` | every date `starts_on..ends_on`, weekdays, A = first 7 days, B = the rest, needs a `school_day` row that is not a holiday |
| CP-12 | the `timetable_clash` view | the same as the layer, written out again |
| CP-11/22 | `tt_need.load` (Python; `tt_live` uses its days) | the same dates, A/B the same, excludes a holiday, needs no `school_day` row |

**Other gaps the scope names.** No engine command or route approves a class's fortnight (`fortnight_approve` is only
reachable by SQL, and it checks the signed-in person through `current_staff()`, which the engine never sets); the
cycle has a command for `approve` only, and CP-24's `/fortnight/move` route checks nobody's group. Hand moves, rule
changes, drafting and cycle steps check no group at all. `settings.load_config` overwrites every non-`seed_once`
config value on every deploy, so a setting the school changed is put back. `engine live watch` does not notice a
stopped voice clean-up, and there is no written way to put the two scheduled jobs on the server. The "engine logs"
workflow prints raw lines into a public repository's Actions log, and its comment says the opposite of what is true.
Engine-made worksheets and print packs carry no school logo.

## Goals

One goal per Done-when line, same numbers.

1. The whole journey (draft, put live, move a lesson, draft the week, approve a class, approve the fortnight) runs on
   one fake fortnight in one engine test.
2. One function owns which dates and which week (A or B) a fortnight covers; every other copy is gone.
3. Cycle steps and class approval each have an engine command and a keyed route; every action that changes the
   fortnight or the timetable checks the group its setting names, for the person the sign-in mapping gives.
4. A deploy keeps a setting the school changed and still adds a new one.
5. The live watch reports a late nightly rebuild or a late voice clean-up; a runbook lists the server steps.
6. The engine-logs workflow prints counts only; its comment is true for a public repository.
7. Worksheets and print packs the engine makes carry the logo as the brand pack's rules say (after #528 merges).

## Non-Goals

The issue's out-of-scope list holds. Also: no new table; no change to a locked file of a merged spec (CP-6, CP-7,
CP-12, CP-22); no new web screen; no parent-report *document* (see Open Question 1); no change to the go-live and
clash-accept group checks beyond sharing the helper they already use.

## Open Questions

1. **Item 7 and parent reports (a trade-off the school would see).** The engine makes no parent-report document today:
   `w4_close/parent_report.py` writes a text draft that the website shows; there is nothing to put a logo on.
   Options: **(A, recommended)** item 7 is met by the documents the engine renders (worksheets and print packs); the
   parent report gets its logo when a report document is built (website, UI scope). **(B)** build a parent-report
   PDF in the engine now: a new feature, against "lean first". Recommendation A, because B adds a document nobody
   has asked the engine to make and doubles item 7's size. Nimish decides this one before the lock (the proof-writer
   needs to know which documents to check).
2. Item 7 waits for #528 (the logo files). If #528 changes the files' names, the proof follows the merged names.

## Critical User Journeys (CUJs)

### CUJ 1: the fortnight, start to finish (item 1)
* **Given**: one school, one class with a standing timetable, a teaching fortnight in the future, a coordinator in the
  groups the settings name, school days on record.
* **When**: the coordinator drafts the timetable (FET), puts it live, moves one lesson by hand, steps the cycle to
  frozen, drafts the week (CP-7), approves the class, steps to aligned, approves the fortnight.
* **Then**: every step succeeds; the class's plan holds the moved lesson on its new date; the fortnight is `approved`.
  On today's main the "draft the week" step fails with "two slots for one period".

### CUJ 2: someone outside the group tries (item 3)
* **Given**: a member of staff with no grant in the group a setting names.
* **When**: they try a cycle step, a class approval, a draft, a hand move or a rule change, by command or route.
* **Then**: refused with the group's name and the setting's key, nothing written (route: 403).

### CUJ 3: a school's setting survives a deploy (item 4)
* **Given**: the school changed `timetable.open_clash_blocks_approval` to `false`.
* **When**: the next deploy runs `engine load --settings`.
* **Then**: it is still `false`; a key added to `config.json` since the last deploy is now present.

## Technical Plan (Architecture)

### Item 1 and 2: one date rule, and the slot reader that knows the layer
One new SQL function, `public.fortnight_days(p_class uuid, p_fortnight uuid)` returning
`(on_date date, week_code text, weekday smallint, school_day_id uuid)`: every date from `starts_on` to `ends_on`, Monday
to Friday, that is not a holiday on the class's campus; week A is the first seven days from `starts_on`, B the rest;
`school_day_id` is the date's `school_day` row when there is one (null otherwise). This is the rule three of the four
copies already use (the day page's rule), so only CP-7's reader changes meaning.

- `internal.fortnight_slots` is redefined (`create or replace`, same signature) to take its dates from
  `fortnight_days` and its rows from the fortnight's layer when the class has one for that fortnight, else from the
  frame (`fortnight_id is null`) valid on the date. This is the fix for item 1.
- `public.timetable_fortnight_layer` and the `timetable_clash` view are redefined to take their dates from
  `fortnight_days` (same output as today on every date that has a `school_day` row).
- `tt_need.load` selects its days from `fortnight_days` instead of computing them.
- `fortnight_plan_line`'s unique key `(fortnight_plan_id, week_code, weekday, period_id)` becomes
  `(fortnight_plan_id, on_date, period_id)`: in a 15-day fortnight the 15th day has the same week, weekday and period as
  the 8th, and the old key would refuse it.
- `internal.fortnight_signature` orders its lines by the whole formatted line, so two lines with the same week,
  weekday and period (the 15-day case) give the same signature every time.

### Item 3: who may, through one helper
- The check stays the one `tt_live.in_group` already makes (CP-3's `staff_role_grant` → `access_role_group`, the
  grant current on the school's day), moved unchanged to a shared `w2_print/who_may.py` (`tt_live` and `tt_clash`
  import it from there), plus one condition: the staff row is active (as `internal.fortnight_is_approver` already
  requires). A setting that is a list of groups is accepted as well as one group, so
  `fortnight.approver_groups` (a list, CP-7) is read by the same helper.
- Who is asking: a route's `actor` (the signed-in email the website sends, as every keyed route does) →
  `public.staff_of_email` → a staff id; a command's `--by` email the same way. For `fortnight_approve`, which checks
  the person itself through `internal.resolve_staff()`, the engine sets `app.staff_id` to that staff row's
  `signin_id` for the transaction (CP-3's sign-in mapping); a staff row with no sign-in is refused.
- Actions and their settings (new keys default to `everything`, the coordinator's group, Nimish 8 Nov):

| Action | Command | Route | Setting |
|---|---|---|---|
| cycle step (freeze, align, approve, list_sent) | `engine fortnight move --to <state>` (and the existing `approve`) | `/fortnight/move` (CP-24) | `fortnight.step_group` (new) |
| draft the week | `engine timetable draft` (exists) | none needed by the scope | `fortnight.step_group` |
| approve a class | `engine fortnight approve-class` (new) | `/fortnight/approve-class` (new) | `fortnight.approver_groups` (CP-7; also checked by the database) |
| put a draft live | exists | exists | `timetable.go_live_group` (CP-22, unchanged) |
| move a lesson by hand | exists | exists | `timetable.change_group` (new) |
| change a timetable rule | exists | exists | `timetable.change_group` |
| accept a clash | exists | exists | `timetable.accept_clash_group` (CP-12, unchanged) |

- The clash check that `engine fortnight approve` makes moves into one function both the command and the route call,
  so stepping to `approved` by the route is held to the same rule.

### Item 4: a setting the school changed is kept
`config` gains one column, `seed_value jsonb` (what the loader last wrote). `load_config`'s upsert, for a row not
marked `seed_once`, becomes: set `value` to the seed's only while the live `value` still equals `seed_value` (the school
has not changed it), and always record the new `seed_value` and description. A new key is inserted as before. On the
first deploy after the migration `seed_value` is null for every row, so every live value is kept and the seed is
recorded; from then on a changed seed reaches every row the school left alone. `seed_once` rows are untouched.

### Item 5: the late jobs
CP-24 adds the nightly line (`graph.nightly_stale_hours`, default 26). CP-25 adds the clean-up line beside it: the
newest `flow_run` with `flow = 'voice_cleanup'` and `status = 'ok'` finished more than `voice.cleanup_stale_hours`
hours ago (new config row, default 3: the job is hourly, so three missed runs), or never. Counts and hours only.
`docs/runbooks/scheduled-jobs.md` gives the exact steps: import `n8n/workflows/f4-nightly-graph.json` and
`f5-voice-cleanup.json` into n8n on the box, attach the engine-key credential, switch both on, and how to confirm with
`engine live watch`. The LIVE proof is a read-only box check that both have an ok run inside their limits.

### Item 6: engine logs
Every step that prints raw text (the container log tail, kernel lines, run error text, raw rows) is replaced by counts:
for example the log's lines by level and HTTP status in the window asked for, runs by status. The header comment says
what is true: on a public repository anyone can read a workflow run's log. The proof reads the workflow and fails on
any step that prints raw log lines.

### Item 7: the logo
Worksheets and packs are HTML pages printed to PDF by Playwright (`assess/render.py`, `w2_print/pack.py`,
`w2_print/library.py`, `w2_print/maker.py`). The lockup-colour SVG from #528 goes inline in the page header, on white,
never recoloured, with the clear space the READ-ME gives. The header must stay outside the answer areas and the marks
the reader lines pages up by: the existing reader tests on a rendered sheet must still pass.

## Alternatives Considered

* **Item 1: delete the layer's frame rows, or make the frame valid only outside live fortnights.** Rejected: CP-22
  locked "the frame is never touched", and the clash view and the day page already read layer-else-frame.
* **Item 2: keep the Monday rule and change the other three.** Rejected: three copies and the day page agree on
  "first seven days are A"; a fortnight starting mid-week would get days before it starts.
* **Item 4 (a): insert-only, never overwrite a value.** One word, but a value a developer changes in `config.json`
  (for example `people.decides`, which a test says must reach live with a deploy) would never arrive. **(b)** ask each
  writer to mark the row as the school's: many writers, easy to miss one. The `seed_value` column needs one column and
  one expression.
* **Item 3: a database trigger for every check.** Rejected: lean first; CP-6 and CP-12 put their checks in the engine.
* **Item 5: an n8n "error workflow".** Rejected: n8n never thinks (rule 3), and a job that never starts raises no error.

## Non-Functional Requirements

* Security & privacy: no name, email or raw log text in any watch line, workflow output or error; refusals name a
  group and a setting key only. The repository is public.
* Rollout: one migration (`20270125200000`, after main's `20270125180000` and CP-24's renumbered `20270125190000`),
  written to run twice. The new settings are inserted per school by the migration with `on conflict do nothing`.
* Rollback: the migration is additive except the unique-key swap on `fortnight_plan_line`; the old key can be put back
  while no 15-day fortnight has been drafted.

--------------------------------------------------------------------------------

## Detailed Implementation Plan

### Order of work
1. Wait for CP-24 (#514) to merge; branch from main.
2. Item 2's function, then item 1 (the journey test is written first and fails on "two slots for one period").
3. Item 3 (helper, then each action, then the two new commands and the one new route).
4. Item 4, item 5, item 6.
5. Item 7 after #528 merges.

### Target Files to Create/Modify

#### 1. `supabase/migrations/20270125200000_the_fortnight_end_to_end.sql` (Create)
`public.fortnight_days`; redefined `internal.fortnight_slots`, `public.timetable_fortnight_layer`, `timetable_clash`
view, `internal.fortnight_signature`; the `fortnight_plan_line` key swap; `config.seed_value`; settings
`fortnight.step_group`, `timetable.change_group`, `voice.cleanup_stale_hours` for every school and on a new school
(the pattern of `internal.timetable_hand_settings`); grants on `fortnight_days` to `app_engine` and `app_web`.

#### 2. `packages/engine/engine/w2_print/who_may.py` (Create)
`in_group(conn, tenant, who, today, key, what)` moved from `tt_live.py`, plus active staff and list-valued settings;
`as_signed_in(conn, staff_id)` sets `app.staff_id` to the staff row's `signin_id` for the transaction.

#### 3. `packages/engine/engine/w2_print/tt_need.py`, `tt_live.py`, `tt_clash.py`, `tt_move.py`, `tt_rules.py`, `fortnight_cycle.py` (Modify)
`tt_need.load` reads `fortnight_days`. `tt_live`, `tt_clash` import `in_group` from `who_may`. `tt_move.move`,
`tt_rules.change`, `fortnight_cycle.move`, `fortnight_cycle.draft_classes` call `in_group` with their setting.
`fortnight_cycle.approve_class(conn, grade, section, year, number, who)` finds the class's newest plan and calls
`fortnight_approve` inside `as_signed_in`.

#### 4. `packages/engine/engine/w2_print/cli_fortnight.py` (Modify), `engine/api/routes/plan.py` (Modify)
Commands `move --to` and `approve-class`; route `/fortnight/approve-class`; the clash check shared by `approve` and the
route's step to `approved`.

#### 5. `packages/engine/engine/core/settings.py` (Modify)
`load_config` upsert as in the Technical Plan.

#### 6. `packages/engine/engine/checks/watch.py` (Modify), `docs/runbooks/scheduled-jobs.md` (Create)
The clean-up line; the runbook.

#### 7. `.github/workflows/engine-logs.yml` (Modify)
Counts only; the true comment.

#### 8. `packages/engine/engine/assess/render.py`, `assess/page_css.py` (Modify)
The logo in the page header.

#### 9. `workflows.json` (Modify)
`who_may.py` on its step; the new route and commands where the map lists doors.

### Which existing proofs and tests are touched

See the section below the line "Impact on merged specs" (filled from the reading of every CP-6, CP-7, CP-12 and CP-22
proof and engine test). Rule: CP-25 edits no locked file of a merged spec. Where a merged proof's fixture would be
refused by a new group check, the fix is in CP-25's code path (the check reads a setting whose default is the group
the fixture's actor already holds), never in the locked proof.

### Verification Plan
* `cd packages/engine && pytest -q` (engine), `bin/check --db` with `TEST_DATABASE_URL` on a local Postgres (every
  migration with the seed), `engine load --check`, `bash specs/CP-25/checks.sh`, and the checks of CP-6, CP-7, CP-12,
  CP-22 (`athena done` for each) still green.
* LIVE (box only, after deploy): the clean-up and nightly have ok runs inside their limits.

### Risks
1. The highest: item 1's journey crosses five scopes; a second fault may sit behind the first (for example the gate
   meeting a class whose layer and plan disagree after a move made after the class was approved). The journey test is
   the only guard; it runs first.
2. CP-7's proofs may expect the Monday rule for a fortnight that starts mid-week; if a locked proof does, CP-25 blocks
   and says so rather than amend it.
3. The new group checks could refuse an actor in a merged spec's fixture that holds no grant in `everything`.
4. Item 7: a header mark the reader mistakes for ink, or that moves the lined-up page; the reader's own tests decide.
5. CP-24 not merged: its route file and watch function are prerequisites.
