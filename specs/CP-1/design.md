# CP-1 design: people, complete

Status: DRAFT for design review. Scope: `specs/CP-1/spec.md`.

## Problem
Facts from the code (8 Nov): the people record (`staff`, `pii.staff`, `staff_role_grant`, `enrolment`, migration
20261225090000) holds 3 staff; the sign-in list is a JSON row in `config` key `app.staff` holding 7. `public.enrol_child`
closes an open enrolment and opens a new one, but `public.move_child` (20261220090000) does not call it, so moving a child
leaves enrolment stale. Edit-history triggers (`internal.curriculum_edit_kept`, `internal.curriculum_link_kept`) already
write `curriculum_edit` rows for activity edits and activity-objective links.

## Goal
Staff = sign-in list (7), each with an open grant; moving a child updates enrolment in one step; K2-A rolls 1..22;
prove the edit-history rows exist.

## Decisions (mechanical, recorded)
- Staff load goes through the existing engine path (`engine staff add`-style) that writes `staff`, `pii.staff` and a grant,
  never raw SQL; names stay in `pii.staff`. Reason: rule 6 and the existing check on grants.
- Which role each of the 4 missing people gets comes from the sign-in list's own role field, mapped by the seeded `role`
  rows. If a role string has no match, the load stops and lists it (counts only). Reason: no guessing roles.
- `move_child` calls `enrol_child` inside its own transaction. Reason: one place for the rule, no new function.
- Roll numbers: a deferrable uniqueness check on (class, roll_no) among open enrolments, plus a data fix for K2-A only
  through `enrol_child` calls, never an UPDATE. Reason: enrolment history is append-style.

## Possible trade-off for Nimish
If the sign-in list holds someone who should not be a person in the record (a shared or test login), "load all 7" is wrong.
The load prints counts and role strings only; Nimish confirms the 7 are real people before the live run.

## Item 5 (edit history)
Triggers appear to cover it already. The scope's proof is a test over the live triggers (insert activity, insert/update
link, assert a `curriculum_edit` row with who/when). If a gap shows, fix the trigger; do not add a second mechanism.

## Implementation list
- `supabase/migrations/<next>_move_child_moves_enrolment.sql`: `move_child` calls `enrol_child`; open-row uniqueness
  per child; roll uniqueness among open enrolments.
- Engine: staff load command/function reading `app.staff`, writing via existing staff code (`engine/core/staff.py`).
- Tests: `packages/engine/tests/test_people.py` additions (move closes/opens, no two open rows), `test_curriculum_edit`
  additions (activity, link). LIVE checks in `specs/CP-1/proofs/` use `check_box`.
- `docs/notes/CP-1.md`; data register entry for any new table (none expected).
