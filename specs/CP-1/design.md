# CP-1 design: people, complete

Status: REVISED after goldfish review (zoom-out, design, implementation-readiness, codebase-details). Scope: `specs/CP-1/spec.md`.
(R) marks a change forced by a review finding.

## Problem (verified in code, 8 Nov)
- `staff`/`pii.staff`/`staff_role_grant` hold 3 people; the sign-in list is the `config` row `app.staff` (7 per Nimish's
  reconciliation; `docs/notes/m0-05-people-enrolment.md` says 8 entries: the builder's first step is a dated count of both).
- `engine/core/people.py::import_staff(conn, by, apply)` ALREADY copies the sign-in list into `staff`, `pii.staff` and a
  campus-wide grant, dry-run by default, counts only, leaves existing people alone, refuses unknown roles. Run as
  `engine staff import [--apply --by NAME]`, behind the signer gate (`signer.first_import_ok`). `engine/core/staff.py`
  only edits the sign-in JSON and must not be used for this (R).
- `import_staff` grants only campus-scoped roles; for class- or child-scoped roles it adds the person and leaves the
  role to be set (people.py ~L90-98). So "every staff row has an open grant" can fail for those people (R).
- `public.move_child(child, band, section, roll, by, reason)` (security definer, returns jsonb refusals) does not touch
  `enrolment`. `public.enrol_child(child, class uuid, roll, from, by)` (security invoker) closes the open row, opens a
  new one, raises `no_such_class` / `date_before_current`, returns `{changed:false}` when nothing changes.
- `enrolment` already has `enrolment_one_open_per_child` and `enrolment_one_open_roll_per_class` (partial unique indexes).
  They cannot be deferrable. No new uniqueness work (R).
- Edit history: `curriculum_edit_kept` fires AFTER UPDATE only on listed activity columns; link triggers
  (`activity_skill_kept`, `activity_objective_kept`, `learning_objective_skill_kept`) fire AFTER INSERT OR DELETE only.
  So adding an activity writes no row and changing a link writes no row: the scope's item 5 is a REAL GAP, not already met (R).
  "Who" comes from `app.changed_by`, else `session_user`.

## Goal
Staff in the record = sign-in list, each with an open grant; a move updates enrolment in the same transaction; K2-A rolls
1..22 on open rows; activity inserts and link changes leave edit-history rows.

## Mechanical decisions (recorded)
1. Staff load = run `import_staff` (dry run first). No new loader, no new engine command, nothing written to `app.staff`
   (spec item 2 checked by a before/after hash of that config value) (R).
2. Missing grants: the dry run prints role strings and counts only. For any person with a class- or child-scoped role,
   the load stops and the builder asks for the class (or a campus role) in the scope's comment thread; it never invents
   one. If every missing role is campus-scoped nothing is asked.
3. `move_child` resolves (band, section) to the one `school_class` row of the CURRENT academic year and the child's
   campus; `from` = today; calls `enrol_child` inside its own transaction; maps `no_such_class` and
   `date_before_current` to its existing jsonb refusal shape so a refusal still changes nothing; takes its `roll_taken`
   pre-check from open `enrolment` rows (the source of truth), keeping `child.roll_no` and `child.section` written as today
   because pages still read them (R). `enrol_child` must also refuse when the class grade differs from the band.
4. K2-A rolls (item 4): one-time data fix through `enrol_child` calls only, never an UPDATE, ordered with a recorded
   plan (move any clashing child to a free number first; no junk "temporary" roll rows are acceptable, so the plan is
   chosen from the live roll list before running). "1 to 22" is defined as: the numeric value of `roll_no` among open
   rows of the 2026-27 K2-A `school_class` row is exactly the set 1..22. It is a LIVE one-time state, not a standing rule (R).
5. Edit history (item 5): new migration redefines the two trigger functions' firing: activity gets AFTER INSERT as well
   as UPDATE; the three link tables get AFTER UPDATE as well as INSERT/DELETE. Same `curriculum_edit` table, same writer
   functions. Test sets `app.changed_by` and asserts the exact row (record, code, field, who).
6. Out of scope, noted: an enrolment guard trigger (only `to_date` null->date, no delete) is a hardening idea; it is not
   asked for here and is left to a later scope.

## The one decision for Nimish
"Load all 7" assumes all 7 sign-in entries are real people. The dry run shows counts and role strings only; the live
run is a separate step that needs a named signer (Nimish's own staff row). If the dry run shows a shared or test login,
he says which, and the scope's number changes before locking. If he says no to the live run, CP-1 item 1 is amended.

## Implementation list
- Create `supabase/migrations/<timestamp later than newest>_people_complete.sql`: `move_child` calls `enrol_child`;
  enrol_child grade/band guard; trigger firing changes for item 5.
- Modify `packages/engine/engine/core/people.py` only if the dry run shows a gap `import_staff` cannot handle.
- Tests: Modify `packages/engine/tests/test_child_move.py` (move closes/opens, never two open rows, rollback leaves
  child and child_move unchanged, no_such_class refusal, same-day move, `changed:false`), `test_people.py` (import
  leaves grants for campus roles), add curriculum-edit cases to the existing curriculum-edit test file.
- `specs/CP-1/proofs/`: LIVE read-only `check_box` counts (staff = sign-in list entries; staff without an open grant = 0;
  K2-A roll set; `app.staff` hash unchanged). No names in output.
- Create `docs/notes/CP-1.md`.
