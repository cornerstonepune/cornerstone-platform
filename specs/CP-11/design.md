# CP-11 design: the timetable generator (FET)

Status: REVISED after the goldfish review (4 reviewers: zoom-out, design, implementation-readiness, codebase-details;
reports in `design-review/`). Issue #459 (draft, not locked). Plan: `docs/backend-plan.md` row CP-11, roadmap task
M1-14, tier 3 (a migration and the engine image). No staff or child name appears here or in the proofs.

## In plain words: what exists, what does not, what CP-11 adds
| | Exists today (main, 8 Nov 2026) | Does not exist | CP-11 adds |
|---|---|---|---|
| FET program | Installed in the engine image (`packages/engine/Dockerfile:21-24`, prints its version at build) and in CI's sharded engine job (`.github/workflows/ci.yml:143`). PR #413, merged without a scope or proofs. | Any code that calls FET. Any proof that FET runs on the box. The "b2" generator was never written (no branch, no file). | Proofs that FET is in the image and runs on the box; one adapter file that calls it. |
| Timetable rules | Four kinds as rows, a screen and a command door (M1-14a, `tt_rules.py`, `/timetable/rules`, migration `20270109090000_timetable_rules.sql`): period times, blocked days/periods (`timetable_block`), fewest/most of a subject per week or fortnight (`timetable_limit`), pinned cells (`fixed` slots); every change in `timetable_rule_edit`. 22 tests. Live: 0 rules entered. | Anything that reads the rules to place lessons. | The generator reads them. |
| The timetable itself | The week A/B frame copied from the school's sheet (`timetable_slot`), loaded by `engine timetable load` (M1-06); sessions with plan lines (`session`, `plan_entry`); the day/week/period pages read it (`k2_day.py`). | A timetable made from rules. | A **draft** made by FET from the rules, kept with its exact input and output, never written over the live timetable. |
| Commands | `engine timetable load` (from the sheet's CSVs) and the rules door. | A generate command. | `bin/engine timetable generate`. |

Putting a draft live (replacing what educators see) is **not** in CP-11: see decision 1.

## Dependencies (named)
- **CP-6.** The plan says CP-11 waits for CP-6. With putting-live moved out, CP-11 reads nothing CP-6 adds and writes no
  table CP-6 guards. The generator may run for any fortnight, frozen or not: a draft changes nothing anyone sees.
  The dependency comes back with the putting-live step, which needs CP-6's freeze.
- **CP-4.** If CP-4's `access_table` (with `data_class`) is on `main` when CP-11 is built, the migration adds one
  `school_wide` row (holds no child data) for `timetable_run` before `select internal.apply_conventions()`, as CP-6 does.
  If not, nothing is added and the builder names it in `docs/notes/CP-11.md`.

## Goal
`bin/engine timetable generate --grade K2 --section A --year 2026-27 --fortnight 10` turns the stored rules for one class
and one fortnight into a FET input file, runs FET, and keeps the result as a draft: either every needed lesson placed,
or a report of lessons placed against needed and, where code can prove it, the rule that blocks them. It never writes
to the timetable, the sessions or the plan lines.

## The design

### 1. What is needed (code computes; FET only places)
For one class (found as `engine timetable load` finds it: grade, section, year) and one fortnight (by `number` within
that academic year):
1. **Days.** Every Monday to Friday from `starts_on` to `ends_on`, by date. A date with a `school_day` row of kind
   `holiday` is left out: its lessons are dropped, not moved (decided, see Decisions). A weekday with no `school_day` row counts as a
   teaching day. Changed-timing days are normal days (named gap). Each day is labelled week A (fewer than 7 days after
   `starts_on`) or week B, the rule `k2_day.py:63` uses. FN10 (23 Nov to 7 Dec, 15 days) therefore has 11 teaching
   weekdays, 7 Dec being a sixth week-B day. The draft is kept by date, so no day is lost or refused.
2. **The standing frame.** The `timetable_slot` rows of the class with `valid_to is null` (the filter `tt_rules.py`
   uses), read for each day's weekday and week. Subject cells are `kind = 'subject'`; `fixed` and `specialist` cells are
   pinned where they are (a visiting teacher's times are not in the database); `empty` cells are free.
3. **Needed lessons.** For each subject, the number of its subject cells on the fortnight's days, then raised to its
   `fewest` and lowered to its `most`: `week` limits per week, then `fortnight` limits on the total. Limits are applied as
   written, after holidays are removed.
4. **Unavailable cells.** Every `timetable_block` on the fortnight: a dated block on its date; a weekday block on that
   weekday of its week, or of both weeks; a whole day or one period. Lessons from a blocked cell are moved, not dropped
   (M1-14a: "a blocked day moves lessons and nothing lands on it").
5. **Checks before FET (code names the rule).** (a) A week limit and a fortnight limit for the same subject that cannot
   both hold. (b) For each week, the lessons of subjects with a week limit against that week's free cells (subject and
   empty cells, less blocked ones). (c) The fortnight's needed total against all free cells. A failure is outcome
   `unmeetable`: FET is not run, and the report names each limit and block that takes or needs the cells, by id and
   its own words, with the numbers ("Week A: 38 lessons needed, 32 free periods").

### 2. The FET run (one adapter file)
- `packages/engine/engine/adapters/fet.py` is the only file that names FET. It writes the input file into a fresh
  temporary directory (removed afterwards), runs `fet-cl` as its own process, unmodified (AGPL, decision D-074 as cited in
  `packages/engine/Dockerfile:21-22`; the decision file itself lives in teacher-os, not readable here), with a time limit and fixed random seeds, and returns the output file's text.
  Database text written into the file is XML-escaped by the standard library, never joined by hand.
- The input models the fortnight as FET days (one per teaching day, named by date) and hours (the subject periods, named
  by start time). One students set: the class, named by grade and section. One activity per needed lesson, tagged with
  its subject code. No teacher, no room, no person's name.
- Constraints: pinned and blocked cells are not available to the class; a lesson of a subject with a week limit is
  allowed only on its week's days; a subject falls at most once a day unless its count is more than its days
  (FET's minimum-days-between-activities constraint at full weight).
- Settings, per school, by the function-plus-new-school-trigger pattern `internal.voice_evidence_settings` uses
  (`20261227090000_k2_voice_evidence.sql:53-80`), read with `settings.config(conn, key, default)`:
  `timetable.solve_seconds` (120) and `timetable.seed` (a fixed number). Stored in each run.
- **Before the lock** the proof-writer pins the exact `fet-cl` flags (time limit, seeds) and output file name by running
  `fet-cl --help` on the version CI installs; the proofs then fail if FET does not behave so. FET's behaviour is not left
  to the build.

### 3. Outcomes
- `placed`: every needed lesson placed.
- `unmeetable`: a check in section 1.5 failed, or FET itself reports the input impossible. The rule is named when code
  found it; when FET found it, FET's own message is kept and every limit and block touching the unplaced subjects is
  listed.
- `not_found_in_time`: FET reached the time limit. Reported as "no timetable found in N seconds", with FET's placed count
  if it gives one, never as "impossible".
In every outcome nothing is written to `timetable_slot`, `session` or `plan_entry`; the run itself is kept.

### 4. What is kept: `timetable_run`
`timetable_run(id, tenant_id, school_class_id, fortnight_id, outcome placed|unmeetable|not_found_in_time, needed int,
placed int, input_text text, output_text text null, fet_version text, seed bigint, solve_seconds int, report jsonb,
draft jsonb, created_by text, created_at)`.
- `input_text` and `output_text` are exactly what FET read and wrote. `fet_version` is the first line of
  `fet-cl --version`.
- `draft`: one entry per placed lesson: date, week, period id, subject code. Grades 1 to 4 have subject educators (Nimish,
  8 Nov), so an entry may later carry an optional `staff_id` and the FET input a teacher per activity; both are a new
  key and a new XML element, with no table change. K2 has one educator, so CP-11 records none.
- Append-only: update and delete are refused by a trigger (the `internal.forbid_change()` pattern).
- Who: `coalesce(nullif(btrim(current_setting('app.changed_by', true)), ''), session_user)`, as CP-6.
- Every query that builds the input file has a fixed `order by`, so the same rules give the same file byte for byte.

### 5. The command
`bin/engine timetable generate --grade --section --year --fortnight [--dry]` in
`packages/engine/engine/w2_print/cli_timetable.py` (the existing `timetable` group; the class flags are the ones `load`
takes). It prints the outcome, needed and placed, the draft as a grid (date, period, subject), and the report. `--dry`
does the same in a read-only transaction and keeps nothing: that is what the box proof runs. The new files and the
command go on W2 step N4 in `workflows.json` (`files` and `commands`); `checks/rules.json` gains the new table.

## Recorded choices (mechanical)
1. One class, one fortnight per run; no teachers or rooms. K2 is one class with one educator; shared-teacher clashes
   are CP-12 and later grades.
2. Pinned (`fixed`, `specialist`) cells stay put.
3. The draft is kept by date, not as week A/B slots, so a 15-day fortnight needs no special case.
4. FET is called through one adapter file, so upgrading it touches one file.
5. Three outcomes, so a timeout is never told to the school as "impossible".
6. A fresh layout from the rules, not "move as little as possible": it can be tested exactly; keeping lessons in place
   needs FET's soft preferences, measured first. A follow-up if the school dislikes reshuffles.

## Decisions (taken, 8 Nov 2026)
1. **Putting a generated timetable live is not in CP-11**: it is the new scope CP-21; the order is CP-11, CP-21, CP-12.
2. **Holidays and blocks.** Nimish: "If a calendar day is declared as a holiday, obviously on those days there won't be
   a timetable." Lessons on a school holiday are dropped. Lessons on a blocked day are moved (a mechanical rule, as
   M1-14a recorded). His framing: "a fortnight is the unit of the timetable, and then everything gets derived from that".

## Alternatives considered
- **Generate and put live in one command**: rejected; putting live is CP-21 (decision 1).
- **Write sessions only**: the day page takes the subject from the slot, so it would show one subject's name with
  another's lesson.
- **Our own placement code instead of FET**: the M1-06 note planned rule-based filling for one class; rejected because
  D-074 chose FET, it is installed, and it is what will handle shared teachers later. Code still does every count and
  check; FET only places.

## Risks and limits
- FET is AGPL: run as its own process, never linked or changed (D-074).
- FET's flags and timeout behaviour differ between versions; the proofs pin them on the version CI installs, and the box
  proof prints the box's version. If CI's and the image's versions differ, both are named (they install the same
  Debian package from the same release today).
- Solve time grows with more classes; one K2 class (about 80 lessons) is small.
- Changed-timing days are treated as normal days; dated `school_day` notes are not read.
- Nothing puts a draft live until CP-21.

## Review outcome (how the findings were resolved)
- Putting live (apply), with the overlay, `_place` reuse, unique key, unplaced-cell text, materials-line cascade,
  concurrent apply, stale-hash check and reader changes: moved out of CP-11 (decision 1). This removes most of the
  blockers raised; the rest are below.
- The 15-day FN10: drafts are kept by date (section 1.1).
- Timeout called "unmeetable": three outcomes (section 3).
- "Writes nothing" against keeping the run: the goal now says nothing is written to the timetable, sessions or plan lines.
- Seeds and reproducibility: fixed seed, stored, and a proof.
- `--class K2-A`: the `load` command's grade, section and year flags.
- The "share" of the fortnight: replaced by the three checks in section 1.5.
- Frame read by `valid_to is null`.
- Box proof made read-only (`--dry` in a read-only transaction).
- `input_sha256` cut. The wording "nothing else calls a subprocess" changed to "the only file that names FET".
- FET behaviours "checked at build": pinned by the proof-writer before the lock.
- Settings follow the existing per-school pattern; CP-4's `access_table` named.

## Proofs (one per Done-when line; the proof-writer writes them after the lock)
Database proofs on the throwaway Postgres (`TEST_DATABASE_URL`), rolled back, with a made-up class in 2031 fortnights.
FET proofs run the real `fet-cl` CI installs. Box proofs use `check_box` and are read-only.
1. FET in the image and on the box: the image build fails without `fet-cl` (Dockerfile check) and CI prints its
   version; box: `fet-cl --version` inside the running engine container.
2. Generate, placed: a made-up fortnight with a block and a limit gives `placed`, needed = placed, every lesson on a
   free cell, each subject's count within its limits, no subject twice a day where its count allows, pinned cells
   untouched, the blocked day empty; the run keeps `input_text` and `output_text` equal to the files FET read and wrote.
3. Unmeetable: too many lessons for the free cells gives `unmeetable`, needed and placed, the blocking limit and block
   named; contradicting limits named; a timeout (one-second limit on an input FET cannot finish) gives
   `not_found_in_time`; in all three, `timetable_slot`, `session` and `plan_entry` are unchanged.
4. Same rules twice: the same input file byte for byte and the same draft.
5. A 15-day fortnight: every teaching weekday is in the draft; a holiday has nothing; `timetable_run` refuses update and delete.
6. LIVE, box only, read-only: `--dry` for the K2 class's current or next teaching fortnight prints `placed` and needed =
   placed; table row counts are the same before and after.

## Implementation list
- `supabase/migrations/<ts>_timetable_run.sql` (timestamp chosen at build): `timetable_run`, its append-only trigger,
  the settings function and its new-school trigger, the `access_table` row if CP-4 is on main; ends with
  `select internal.apply_conventions()`.
- `packages/engine/engine/adapters/fet.py`; `packages/engine/engine/w2_print/tt_generate.py` (needed, checks, run,
  report); `packages/engine/engine/w2_print/cli_timetable.py` (`generate`); `workflows.json`; `checks/rules.json`;
  a test file per module; `docs/notes/CP-11.md`.
- Not touched: `timetable_slot`, `session`, `plan_entry` writers and readers, `k2_day.py`, the website.
