# CP-21 design: a draft goes live

Status: reviewed by three fresh reviewers (simplicity, design, codebase accuracy); every blocker and major is applied
below (`specs/CP-21/design-review/summary.md`). Written unattended (no author gates), so mechanical choices are mine, recorded with reasons;
the ones that are Nimish's are under "Decisions for Nimish". Read with `specs/CP-21/spec.md`. Reports:
`specs/CP-21/design-review/`.

## Problem
CP-11 makes a draft timetable (one class, one fortnight, kept by date in `timetable_run.draft`) and writes nothing live.
The educator's day still shows the school's sheet. Putting a draft live is where CP-11's four reviewers found every risk:
- Fortnight 10 runs 15 days (23 Nov to 7 Dec), so week B's Monday comes twice; a week A/B grid cannot hold two different
  Mondays.
- The grid's unique key (class, period, week, weekday, `valid_from`) refuses a second version of a fortnight that starts on
  the same day as the standing frame (the loader starts every frame row on the first loaded fortnight's start).
- Deleting a `session` deletes its materials links (`materials_line_source.session_id ... on delete cascade`), and a
  materials link carries the session's date (`materials_line_source.on_date`, `materials_line.needed_on`).
- The loader's `_place` works on in-memory sheet objects; it cannot re-place sessions from database rows.
- Three places read the grid: `k2_day.py:64` (the educator's day, the row valid on a date), `educator_gate.py:57` (only
  that a row exists) and `tt_rules.py` plus CP-11's generator (the standing frame, `valid_to is null`).

## Goal
One command puts one placed draft live for one class and one fortnight. Every date of the fortnight shows exactly the draft.
Every already-planned lesson keeps its plan line and materials lines. Nothing is deleted that carries anything. The step is
kept with who, when and which draft, and it cannot silently overwrite a person's later changes.

## Dependencies (named)
- **CP-11 (issue #459, PR #486, draft scope).** Facts used: `timetable_run(id, school_class_id, fortnight_id, outcome
  placed|unmeetable|not_found_in_time, input_text, draft jsonb, ...)`, append-only; `draft` holds one entry per placed lesson:
  date, week, period id, subject code; the same rules give the same input file byte for byte (its Done-when 4); the frame it
  reads is the class's `timetable_slot` rows with `valid_to is null`; `fixed` and `specialist` cells stay where they are.
  If CP-11's locked words differ, this file is corrected before the proofs are written.
- **CP-6 (issue #454, fortnight cycle).** Assumed: a change to `timetable_slot` in a fortnight that is not `planning` is refused
  unless `app.change_reason` is set, and is then logged in `fortnight_edit`; `session` is not gated.
- **CP-4 (issue #452).** CP-21's one new table is listed in `public.access_table` (it has `school_class_id`: child data by
  class) before `select internal.apply_conventions();`; `engine/checks/rules.json` is regenerated.
- **CP-12 (by hand) waits for this.** It relies on: a live fortnight is a layer of dated rows (`fortnight_id` set), one per
  date and period; `timetable_fortnight_layer` to make that layer from the frame for a fortnight that never went live; the
  lock on (tenant, class); the snapshot guard in decision 6 (a hand move changes the layer, so a later go-live sees it).

## Mechanical decisions (recorded, with reasons)
1. **A live fortnight is a layer of dated rows on top of the standing frame; the frame is never touched.** Going live writes,
   for each teaching date of the fortnight and each period of the class's grade, one `timetable_slot` row with
   `valid_from = valid_to = that date` and a new nullable column `fortnight_id` set (frame rows keep it null). Content: the
   draft's lesson in that cell (`kind = 'subject'`, its subject code, the text the frame uses for that subject); else the
   frame's `fixed` or `specialist` cell; else `empty` (with a block's reason as text where a block covers the cell). Holidays
   get no rows. Week A/B and weekday come from the date as `k2_day.py` works them out, so a 15-day fortnight is no special
   case. Reason (review): the frame, `tt_rules.py`, CP-11's frame read stay as they are (the loader only gains a refusal, decision 8); no row covering an
   earlier frozen fortnight is ever edited.
2. **One reader changes.** `k2_day.py`'s join picks, for a date and period, the row with `fortnight_id` set when one exists,
   else the frame row. `educator_gate.py` only asks whether a row exists and is unchanged. `tt_rules.py` and CP-11 keep reading
   `valid_to is null`, which dated rows never match. A rule change (a pin, a block) reaches a live fortnight only when a new
   draft is made and put live; the go-live output says so.
3. **No two layer rows for one cell.** A partial unique index on (class, period, `valid_from`) where `fortnight_id is not null`.
   Putting the same fortnight live again deletes that fortnight's layer rows and inserts the new ones in one transaction
   (layer rows carry no materials or plan links, so nothing cascades). One function, `timetable_fortnight_layer(class,
   fortnight, source)`, writes the layer; CP-12 reuses it with the frame as source when a fortnight that never went live is
   first moved by hand.
4. **Sessions on subject lessons move; nothing else does.** Only sessions sitting on frame cells of `kind = 'subject'` take
   part; sessions on `fixed` and `specialist` cells (circle, lunch, a visiting teacher) stay where they are. For each subject
   and each week (A, B), its sessions with `state = 'planned'` and `planned = true`, ordered by their plan line's `ord`
   (sessions with no plan line last), are matched to the draft's lessons of that subject in that week, ordered by date and
   period. Week A lines stay in week A (`plan_entry.week_code`, which `k2_day.py` reads). A matched session's
   `school_day_id` and `period_id` change to its lesson's cell; its id, plan line, text and materials links stay with it.
   - Sessions trade places inside one transaction, so the session key (class, day, period) is re-made `deferrable initially
     immediate` (dropped and re-added: a unique key's deferrability cannot be altered) and the step runs `set constraints
     ... deferred`. Postgres refuses a deferrable key as an `on conflict` arbiter, so the loader's session insert
     (`k2_timetable_sql.py:94`, a bare `on conflict do nothing`) is rewritten as `where not exists`; a test re-runs the load.
   - A draft lesson with no session left to match gets no session: the day page then shows the grid row's text
     (`coalesce(s.text, ts.text)` in `k2_day.py`). Making sessions and choosing plan lines for new lessons is a later step if
     the school wants it.
   - A session with no draft lesson left to match is deleted only if it has no materials link; its plan line is printed as
     "no lesson this fortnight". Otherwise the step stops (see 5).
   - A moved session with materials links that changes date: its `materials_line_source.on_date` and the line's
     `needed_on` move with it in the same transaction, if the list is not yet sent and the new date is inside the list's
     dates; otherwise the step stops (see 5).
   - `led_by_staff_id` stays with the session untouched.
5. **Refusals, writing nothing, with the reason and a list where there is one:** the run is not `placed`, or is for another
   class or fortnight; the rules changed since the draft (CP-11's input file built now differs from `input_text`; the frame is
   never touched, so another fortnight going live does not make a draft stale, tested); the fortnight's first day is today
   or earlier (time zone from the existing `school.time_zone` setting): a fortnight under way is changed by hand (CP-12); a
   draft date with no `school_day` row (the loader makes 14 days, so FN10's 7 Dec needs its row first); a session in a cell
   the draft changes that is not `state = 'planned'` with `planned = true`; a session that would be deleted while it has
   materials links; a moved session whose materials list is sent or whose new date is outside its list; a fortnight that is
   not `planning` in CP-6 with no `--reason` (checked by the step itself before any write; it never sets a reason for the
   person). CP-6 lets a fortnight be frozen before it starts (its freeze date is days before the first day), so this refusal
   is testable.
6. **A person's later changes are never silently overwritten.** Table `timetable_live (id, tenant_id, school_class_id,
   fortnight_id, run_id references timetable_run, snapshot jsonb, discarded_changes int, reason, who uuid not null references
   staff, at timestamptz default clock_timestamp())`, append-only through `internal.forbid_change()`. `snapshot` is the
   fortnight's layer rows (date, period, kind, subject, text) and its sessions (id, date, period, plan line, state, text),
   sorted by date and period, taken right after going live. A later go-live for the same class and fortnight compares the
   current state with the last snapshot; if any entry differs (a hand move, an edited session), it is refused with the
   number of changed entries unless `--discard-changes` is given, and that number is recorded. Pins and blocks change the
   frame, not the layer, so they are not counted here (decision 2).
7. **One lock per class.** The step takes `pg_advisory_xact_lock` on (tenant, class) first; CP-12 takes the same lock.
8. **The loader stays off a live fortnight.** `engine timetable load` refuses a fortnight that has a `timetable_live` row and
   lists it, so the school's sheet cannot put old sessions back under a generated timetable.
9. **The command.** `bin/engine timetable go-live --grade --section --year --fortnight N --run RUN_ID --by EMAIL
   [--reason TEXT] [--discard-changes] [--dry]` in `cli_timetable.py` (class flags as `load`). `--by` resolves the person
   through `cli_map.staff_of` (the CLI's own, which raises a command-line error). `--dry` runs every check and works out the
   changes without writing (no write grant needed), printing per date: lessons placed, sessions moved, sessions removed,
   plan lines with no lesson; the box proof runs it in a read-only transaction, which needs a placed CP-11 run on the box.
   `engine timetable go-live` goes on W2 step N4's `commands` in `workflows.json`.

## Decided by Nimish (8 Nov)
- **Only the coordinator puts a draft live** ("Only the coordinator puts a draft timetable. That is okay."). A settings
  row `timetable.go_live_group` (default: the coordinator group, "everything" in CP-3) in `supabase/seed/config.json`, read
  with `settings.config`; the step refuses anyone whose role is not in that group, before any write.
- **The fortnight is the unit** ("a fortnight is the unit of the timetable, and then everything gets derived from that").
  Going live works on one fortnight; week, day, hour and quarter views are derived later. CP-21 builds no per-week or
  per-day store: the dated layer rows are the fortnight's cells, and week A/B is worked out from the date as today.

## Implementation list (files)
- `supabase/migrations/<next, after CP-4, CP-6, CP-11>_a_draft_goes_live.sql`: `timetable_slot.fortnight_id`, the partial unique
  index, the session key made deferrable, `timetable_live`, `timetable_fortnight_layer`, the go-live function (grants as CP-4 sets),
  `access_table` row, `select internal.apply_conventions();`.
- `packages/engine/engine/w2_print/cli_timetable.py`: `go-live`. `k2_day.py`: the layer row wins. `k2_timetable_sql.py`:
  `where not exists`, and the refusal for a live fortnight.
  `workflows.json`: N4. `engine/checks/rules.json` regenerated.
- `supabase/seed/config.json`: `timetable.go_live_group`.
- Tests: `test_timetable_go_live.py`: someone outside the go-live group is refused, exact draft on every date, before/after fortnights unchanged, 15-day fortnight,
  holiday, FN10's 7 Dec, only subject sessions move, week A lines stay in week A, materials dates follow, the
  stop-and-list cases, a second fortnight's draft not stale after the first goes live, loader re-run and its refusal, each refusal, record append-only, changed-since
  guard with and without discard, frozen with and without reason, `--dry` writes nothing, reader pages unchanged.
- `docs/notes/CP-21.md`: the branch note. Not touched: `apps/web`, `STATE.md`, `HANDOFF.md`.

## Alternatives considered
- **Split the frame around each live fortnight.** Rejected after review: breaks for FN10 itself (frame rows start on its
  first day), for the next fortnight, and for pins on the rules screen; and it edits rows that cover frozen fortnights.
- **Week A/B rows valid for the fortnight.** Rejected: cannot hold FN10's two different week-B Mondays.
- **Delete and re-make the fortnight's sessions.** Rejected: cascades to materials links.
- **Swap through a temporary period instead of a deferrable key.** Rejected: needs a fake period row in a real table.
- **Undo as a whole.** Not built: a draft went live only after a trial run, and putting another draft live is the way back.

## Risks not verified
- No live data seen; CP-6 and CP-11 are drafts. That Postgres refuses a deferrable key as an `on conflict` arbiter is from
  the reviewers' memory; the build proves it with the loader test before relying on either path.
- FN10's 7 Dec has no `school_day` row if the loader made 14 days; go-live for FN10 is refused until that row exists.
