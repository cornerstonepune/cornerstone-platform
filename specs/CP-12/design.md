# CP-12 design: the timetable by hand

Status: reviewed by three fresh reviewers, then updated on 8 Nov to CP-11's draft scope (PR #486) and split (see "Split") (simplicity, design, codebase accuracy); every blocker and major finding is applied
below (see `specs/CP-12/design-review/summary.md`). Written unattended (no author gates), so mechanical choices are mine,
recorded with reasons; the ones that are Nimish's are under "Decisions for Nimish". Read with `specs/CP-12/spec.md`.

## Problem
After the generator (CP-11) places a fortnight's lessons, the school will want to move some by hand: swap two lessons, put a
specialist's lesson on another day. Today nothing supports that. No record says who moved a lesson, and nothing notices when a
move breaks a rule: a lesson on a blocked day or period, a subject above its most or
below its fewest. A broken rule may be acceptable (the school knows something the rules do not), but only when a person has
said so, by name and with a reason.

## Goal
A person moves a lesson inside one fortnight. The move is kept with who, when, from where, to where and why. Every clash in a
fortnight is listed, worked out from the timetable as it stands, so the list cannot go stale. A person accepts a clash with a
reason. A fortnight with a clash nobody accepted cannot be approved (a setting per school, on by default). The educator's day
shows the lesson in its new place. Nothing is moved, accepted or regenerated without a record.

## Was some of this already done? (plain words)
Already done (M1-14 part a, the rules screen `/timetable/rules`): a person can change a period's times, block a day or period
for a class, set a subject's fewest and most per week or fortnight, and pin or release a fixed slot (pinning replaces the
lesson in that place). Each of those changes is kept with who and what it was before (`timetable_rule_edit`). A period time
that overlaps its neighbour is refused. FET is installed (#413).
Not done: moving or swapping a lesson inside a generated fortnight; a record of such moves; finding clashes between lessons
(a lesson on a blocked day, a subject outside its limits) in the timetable as it stands; accepting a clash;
stopping approval while a clash is open. CP-11 makes a draft; CP-21 (proposed) puts it live; CP-12 adds the rest
on top of the live timetable. No screen in either: the calendar and drag to move
wait for the frontend.

## What exists today (main at 1d80380, 8 Nov 2026)
- `timetable_slot`: the grid. One row per class, period, week (`A`/`B`), weekday, with `kind` (`fixed`, `subject`,
  `specialist`, `empty`), `subject_code`, `text`, and validity `valid_from`/`valid_to`. Unique (class, period, week, weekday,
  valid_from), not deferrable. The K2 load is expected to write 150 rows (15 periods x 5 days x 2 weeks), one set valid across
  all loaded fortnights (`docs/notes/m1-06c-timetable-run.md`, a forecast, not a live count).
- `tt_rules.py` (`_fixed`, `_subjects`, `_fixed_rule`, `_end`) treats the row with `valid_to is null` as the current one.
- `session`: one dated lesson (class, `school_day`, period), with `subject_code`, `state` (`planned`, `done`, `not_done`,
  `moved`), `planned`, `led_by_staff_id` (nothing writes it: only its column definition and `rules.json` mention it),
  `plan_entry_id`, `text`. Unique (class, day, period), not deferrable.
- The educator's day (`k2_day.py`) works out week A/B from the date (`on_date - starts_on < 7`, the same for every grade), skips
  `holiday` days, reads the grid row valid on that date, then joins the session on (class, day, period).
- `period` belongs to a grade (`grade_code`, `starts_at`, `ends_at`, `fixed`); two grades' periods can start at different times.
- Rules: `timetable_block`, `timetable_limit`, and `timetable_rule_edit` (append-only through `internal.forbid_change()` as a
  statement trigger, `who uuid not null references staff`, `at timestamptz default clock_timestamp()`). CP-12 copies this.
- `fortnight` (`number`, `kind`, `starts_on`, `ends_on`); `number` is empty for non-teaching fortnights.
- Settings: rows in `supabase/seed/config.json`, read with `settings.config(conn, key, default)`.
- Who acts: the rules route fills `who` from an email through `voice_intake.staff_of` (`public.staff_of_email`); the CLI
  pattern is a required `--by EMAIL` on writes (`w1_bank/cli_map.py`).
- `internal.apply_conventions()` still gives both app roles an allow-all policy; per-class rules arrive with CP-4.
- No room table, and no record of which adult leads a grid lesson.

## Dependencies (named, with assumptions)
None of CP-4, CP-6 or CP-11 is on main yet. Each is used through stated assumptions; if a locked scope's words differ, the
build follows that scope and this file is corrected before the proofs are written.
- **CP-11 (the generator, issue #459, PR #486). Facts from its draft scope, no longer assumptions:** FET is installed but
  no code calls it yet; live has 0 rules entered. CP-11 makes a **draft only**, for one class and one fortnight, kept by date
  in `timetable_run.draft` (append-only), and writes nothing to `timetable_slot`, `session` or `plan_entry`. It records no
  teachers and no rooms. Putting a draft live is out of CP-11 (its decision 1).
- **CP-21 (putting a draft live; proposed, not yet scoped; see "Split" below).** CP-12 moves lessons in a fortnight that is
  live, so it waits for CP-21. If CP-21 writes a fortnight as rows valid only inside it, the one-time copy in decision 1
  never runs. Refusing to put a new draft live over a fortnight that has hand moves (unless they are knowingly discarded, and
  recorded) is CP-21's job, because CP-21 owns overwriting the live timetable.
- **CP-6 (the fortnight cycle, issue #454; relocked at fortnight level on 8 Nov, so the backend plan's "month" wording is
  stale).** Assumed names, from CP-6's design on its own branch:
  1. the freeze unit is the fortnight; states planning, frozen, aligned, approved, list sent;
  2. a change to `timetable_slot` in a non-planning fortnight is refused unless `app.change_reason` is set for the transaction,
     and then one `fortnight_edit` row is written; `session` is not gated;
  3. one function moves a fortnight to its next step; CP-12 adds a check to the step into `approved` (decision 6).
- **CP-4 (access, issue #452).** CP-4 adds `public.access_table`, and a CI check fails on any unlisted table. CP-12's migration
  must come after CP-4's and adds one row per new table: `timetable_move` is child data keyed by class (it has
  `school_class_id`); `timetable_clash_accept` is school-wide with the reason "a clash can span classes; holds no child data".
  The build regenerates `engine/checks/rules.json` (`engine live rules --write`) and keeps `test_roles.py` green.

## Mechanical decisions (recorded, with reasons)
1. **Each fortnight gets its own grid rows; a move swaps what two places hold.**
   - **Copy once.** The first move in a fortnight for a class copies that class's grid into rows valid only from the
     fortnight's first to its last day, and splits any open-ended row around it (the row before ends the day before; a new
     open-ended row starts the day after). Nothing is copied twice. Splitting writes `valid_to` on a row that may cover an
     earlier, frozen fortnight; the copy sets `app.change_reason` to "fortnight N given its own rows; nothing before it
     changed", so CP-6 records it rather than refusing it.
   - **No double lessons, ever.** An exclusion constraint on `timetable_slot` (class, period, week, weekday, date range
     `[valid_from, valid_to]`, `btree_gist`) makes two rows valid for the same place on the same day impossible. The build
     checks that live data already obeys it before adding it.
   - **A move is a swap of contents.** Every place in the copied grid has a row (`empty` included). `timetable_move(p_slot,
     p_to_slot, p_by uuid, p_reason)` exchanges `kind`, `subject_code` and `text` between the two rows in one
     `update`. The places (period, week, weekday, dates) never change, so neither unique key is touched part-way and row ids
     stay put. Moving into an empty place is a swap with that empty row.
   - **A place can have two dates.** Week A/B comes from the date (`k2_day.py`), and a fortnight can run 15 days (FN10: 23 Nov
     to 7 Dec, so 7 Dec is a sixth week-B day and week B's Monday falls twice). A move acts on the place, so it moves the
     lesson on every date that place has in the fortnight; the move row lists the dates.
   - **The dated lessons follow.** For each date each place has in the fortnight, the two `session` rows exchange
     `subject_code`, `plan_entry_id`, `text` and `led_by_staff_id` in one `update`. If only one place has a session, that
     session's `school_day_id`/`period_id` change to the other place (that place is free, so no key clash). State stays
     `planned`: the lesson is rescheduled in the plan, not recorded on the day; `moved` keeps its existing meaning.
     Session rows are updated in place, never deleted and re-inserted: `materials_line_session.session_id` is `on delete
     cascade`, so a delete would silently drop the materials lines linked to that lesson.
   - **Refused, writing nothing, with the reason:** either place `fixed` (slot or period); the two places in different classes
     or different fortnights; a period not of the class's grade; either date already past (`now()` in `Asia/Kolkata`); either
     date a `holiday` or with no `school_day` row; a session at either place not `planned` or with `planned = false`.
   - `app.change_reason` is set to `p_reason`, or explicitly cleared when there is none, so CP-6's freeze applies unchanged.
2. **The move history is one append-only table.** `timetable_move (id, tenant_id, school_class_id, fortnight_id, from_slot,
   to_slot, from_week, from_weekday, from_period, to_week, to_weekday, to_period, moved_kind, moved_subject, reason, who uuid
   not null references staff, at timestamptz default clock_timestamp())`, with `internal.forbid_change()` as a statement
   trigger. No name stored. An undo is a move back, also kept.
3. **Clashes are worked out, not stored.** View `timetable_clash (tenant_id, fortnight_id, fortnight_number, week_code, kind,
   clash_key, places, staff_id, rule_id, detail, accepted)`, over each fortnight's grid rows. Kinds:
   - `blocked`: a lesson on a `timetable_block` of its class (a date in the fortnight, or a weekday with optional week; all
     periods or that period);
   - `over_limit` / `under_limit`: a subject's count for a class in week A, week B or the whole fortnight above `most` or below
     `fewest`; driven from `timetable_limit`, so a subject with no lessons at all still shows as `under_limit` (no places).
   Not kinds: "the same class twice" (the exclusion constraint makes it impossible); "the same adult twice" and rooms: no
   adult or room is recorded on any lesson (CP-11 records no teachers; K2 is one class with one educator), so neither can be
   checked or proved. They come with the scope that records who teaches a lesson; the clash list is built so a kind can be
   added as one more `union` branch. A fortnight with no
   `number` is shown by its dates. Reason: a derived list cannot go stale after a move, an undo or a rule edit.
4. **An acceptance covers exactly one clash, by what it is, not by row ids.** `clash_key` = a hash of: kind, fortnight id, the
   sorted places (class, week, weekday, period) involved, the rule id with its `fewest`/`most`, and the count (for limits).
   If a lesson moves, or the limit or count changes, the key changes and the
   clash is open again. Table `timetable_clash_accept (id, tenant_id, fortnight_id, clash_key, kind, reason not blank, who uuid
   not null references staff, at)`, append-only, no class column (a clash can span classes). Function
   `timetable_clash_accept(p_key, p_by, p_reason)` refuses a key that is not a current clash.
5. **One lock per fortnight.** Move, copy, accept, and the approval check each take
   `pg_advisory_xact_lock` on (tenant, fortnight) first, so a move cannot slip in between an approval's count and its commit,
   and two moves cannot copy the same grid twice.
6. **Approval waits for clashes, as a setting.** Seed row `timetable.open_clash_blocks_approval` = `true` in
   `supabase/seed/config.json`, read with `settings.config`. When true, CP-6's step into `approved` is refused while the
   fortnight has an unaccepted clash, naming the count by kind. The count runs in a `security definer` function over the whole
   school, so an approver who sees only some classes cannot miss a cross-class clash. A move in a fortnight already approved (or
   later) is refused if it would leave an unaccepted clash in that fortnight; one that leaves none is allowed (with CP-6's
   reason).
7. **Hand moves are not wiped by a new draft.** Moved to CP-21 (it owns putting a draft live over the timetable). CP-12 gives
   it what it needs: `timetable_move` rows per fortnight with `at`, so CP-21 can count moves made since the fortnight last
   went live.
8. **Who.** Every write takes the person as a staff id resolved from their email through the existing `voice_intake.staff_of`.
   CLI: `engine timetable move`, `engine timetable accept` take a required `--by EMAIL` (as `cli_map.py`);
   `engine timetable clashes --fortnight N` prints one group per fortnight headed `FN<n>` (or its dates), each clash on one
   line with kind, week and detail, never a name. The commands go in `cli_timetable.py` and on N4's
   `commands` in `workflows.json`; any new engine file also goes on N4's `files`. No API route (no screen in scope).
9. **The rules screen stays right after a copy.** `tt_rules.py`'s fixed-slot pin and release change every row of that place
   valid from today on, including a fortnight's own rows, not only the `valid_to is null` row; one test proves a pin after a
   move leaves one lesson in that period.
10. **No live writes from a session.** The LIVE proof is `check_box`, read-only, counts per fortnight only.

## Split: CP-12 is two scopes, not one (proposed 8 Nov, after CP-11 moved "putting a draft live" out)
CP-11's reviewers found every risk in putting a draft live: FN10 is 15 days and does not fit the week A/B grid; the grid
refuses a second version of a fortnight (unique key on `valid_from`); replacing `session` rows would cascade-delete their
materials lines; and it changes what educators see under CP-6's freeze. Those are a different job from moving one lesson, with
their own proofs. Stretching CP-12 to hold both would double its Done-when list and put two tier-3 data changes in one
migration. Proposal:
- **CP-21: a draft goes live** (new row in `docs/backend-plan.md`, a change Nimish approves). Waits for CP-11, CP-6, CP-4.
  Puts one CP-11 draft live for one class and one fortnight, by date (so a 15-day fortnight loses no day); updates sessions
  in place so plan lines and materials lines stay linked; refuses under CP-6's freeze without a reason; refuses to overwrite
  hand moves unless they are knowingly discarded, with who recorded; can be undone as a whole.
- **CP-12: the timetable by hand** (this file). Waits for CP-21.
Order: CP-11, then CP-21, then CP-12. I have not drafted CP-21's scope: that waits for Nimish's yes to the split.

## Decisions for Nimish (only what changes what the school sees, or safety)
0. **The split above** (CP-21 puts a draft live; CP-12 moves lessons by hand). Recommendation: yes.
1. **Does a hand move change only that fortnight, or every fortnight after it?** Recommendation: only that fortnight. The
   fortnight is the planning unit, and a lasting change belongs in the rules (a fixed slot, a block) so the generator keeps it.
2. **Who may accept a clash?** Accepting means the school knowingly breaks its own rule (a lesson on a blocked day, a
   subject over its limit). Recommendation: only the coordinator group ("everything" in CP-3), not the educator who made the
   move. Moving stays open to anyone who may change the timetable. Until he decides, the proofs use this default.
Not asked (no data to decide on): "the same adult twice" and rooms. No lesson records its teacher or room, so both wait for
the scope that records who teaches what.

## Implementation list (files)
- `supabase/migrations/<next, after CP-4 and CP-6>_a_lesson_moved_by_hand_is_kept.sql`: `btree_gist`, the exclusion
  constraint, `timetable_move`, `timetable_clash_accept`, the view, the functions (`revoke ... from public`, grants as CP-4
  sets), `access_table` rows, `select internal.apply_conventions();`.
- `supabase/seed/config.json`: the setting. CP-6's step function: the clash check.
- `packages/engine/engine/w2_print/cli_timetable.py`: three commands. `packages/engine/engine/w2_print/tt_rules.py`:
  date-aware fixed-slot edits. `workflows.json`: N4.
- Tests: `test_timetable_move.py` (copy once, swap, move into empty, sessions follow, every refusal, history append-only, frozen
  with and without reason, lock); `test_timetable_clash.py` (one per kind, accept, reopen after a second
  move, after a limit change, approval refused and allowed, approved-fortnight move).
- `engine/checks/rules.json` regenerated. `docs/notes/CP-12.md`: the branch note. Not touched: `apps/web`, `STATE.md`,
  `HANDOFF.md`.

## Alternatives considered
- **Store clashes in a table filled at move time.** Rejected: stale after a rule edit or a second move.
- **Refuse any move that makes a clash.** Rejected: the roadmap says a clash can be accepted by a person.
- **Move rows between places (change period and weekday).** Rejected after review: breaks the non-deferrable unique keys
  part-way through a swap and changes row ids, which an acceptance would have depended on.
- **Split rows on every move.** Rejected after review: multiplies rows and reopens accepted clashes in later fortnights.
- **Move the dated lesson (`session`) only.** Rejected: the educator's day, the generator and CP-6's freeze all read the grid.

## Risks not verified
- CP-4, CP-6 and CP-11 words (assumptions above). No live data seen.
- That live `timetable_slot` already obeys the exclusion constraint (the build checks before adding it).
- That `btree_gist` can be enabled on the live Supabase project (it is a standard extension; not checked).
