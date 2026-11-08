# CP-1 branch note: people, complete

Scope `specs/CP-1/`, design `specs/CP-1/design.md`. Migration `supabase/migrations/20270111090000_people_complete.sql`.
No new table, so the data register is unchanged (proof 6 reads zero un-owned tables).

## What the migration does
- `public.move_child` now calls `public.enrol_child` in its own transaction. It resolves (band, section) to the one
  `school_class` row of the academic year that contains today, on the child's campus (their open enrolment's; any when
  they have none), and enrols from today. The write to `child` and the enrolment are one block: if either fails, neither
  stays, and the function returns its usual refusal (`roll_taken`, `no_such_class`, `date_before_current`).
- `roll_taken` is now checked against open `enrolment` rows; the `child (section, roll_no)` unique key still catches a
  child with no enrolment. `child.section` and `child.roll_no` are still written (pages read them).
- Edit history: `activity` also fires on INSERT (one row per non-empty tracked field, before empty); the three link tables
  also fire on UPDATE (a removal row for the old link and an addition row for the new one; a change to `ord` or `source`
  alone writes nothing). Who = `app.changed_by`, else `session_user`, as before.

## Decisions taken while building
- **Not built: a grade guard in `enrol_child`.** The design asked `enrol_child` to refuse a class whose grade differs from
  the child's band. The existing `test_people.py` enrols a K2 child into a G3 class on purpose, and existing test lines may
  not change. `move_child` picks the class by the child's own band, so it cannot mismatch; the guard would only have
  protected direct callers. Left out; say if you want it, together with that test's change.
- **Only K2 has class rows on live (read-only count, 8 Nov: 1 `school_class`, 22 open enrolments, 29 active G1-G3 children
  with no enrolment).** So a move to a class with no row is refused only for a child who has an open enrolment (it would
  leave the record on the wrong class). A child with no enrolment moves exactly as before. Found when the full suite's
  `test_roster.py` failed on a first version that refused every such move, which would have blocked all G1-G3 moves live.
  Other grades join the enrolment rule as their classes are loaded.
- **Tests.** `test_child_move.py` gets one helper (`_school_class`) and new tests only; no existing line changed.
- Several campuses: with none on the child, the oldest matching class wins. One campus today.

## Tests
`test_child_move.py` (4 new), `test_k2_upload.py` (2 new), plus the locked proofs. Ran against a Postgres 16 built with
`bin/testdb fresh` from all migrations.

## Remaining on the box after deploy (not run from this session; nothing here wrote to the live database)
All are data changes needing Nimish's go-ahead and a named signer. Names never appear in any output below.

1. **Staff load (proof 1).** Dry run first; it prints counts and role strings only:
   `bin/engine staff import`
   If a person's role is class- or child-scoped, the import adds the person but leaves the role to be set: stop and
   say which class (or a campus role) each needs; do not invent one. Then, with the signer's email (Nimish's own staff
   row; check `bin/engine staff import --help` for the exact option):
   `bin/engine staff import --apply --by <signer email>`
   The sign-in list (`app.staff`) is not touched by this command (proof 2 hashes it).
   Open question for Nimish: are all 7 sign-in entries real people? A shared or test login changes the scope's number.
2. **K2-A rolls 1 to 22 (proof 4).** Look first (read-only, counts only):
   `bash specs/CP-1/proofs/box_k2a_rolls.sh`
   If it fails, read the roll list of that class, write the plan (move any clashing child to a free number first, no
   temporary rows), and apply it only through `enrol_child` calls, never an UPDATE of `enrolment`.
3. After both: `bash specs/CP-1/proofs/box_staff_count.sh` and `bash specs/CP-1/proofs/box_k2a_rolls.sh` must pass on the box.

## CI note
The database-backed proofs (3, 5, 6) need a throwaway Postgres in the athena job (CP-20, another session). Until it
merges they report "no local test database" in GitHub; locally they pass.
