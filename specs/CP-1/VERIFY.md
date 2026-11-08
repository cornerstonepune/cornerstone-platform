# CP-1 verification (athena-verifier, independent)

PASS on everything that can be checked before deploy. Items 1 and 4 are not met yet. Both can only be checked on the production box, and both also need data work that has not been done: loading the staff, and fixing the K2-A roll numbers. No code in this diff does either. Do not call items 1 or 4 done until their box checks pass on the box.

I could not re-run the proofs. In my shell `athena done CP-1` says "no local test database" for proofs 2, 3, 5 and 6 (`TEST_DATABASE_URL` is not set), so that run reports nothing about the code. The PASS for those four comes from the builder's run record, `specs/CP-1/RUN.json` (ran 2026-11-08 10:09, all four passed, none failed), plus my own reading of the code.

**1. Criteria**
1. **UNCLEAR, box-only, pending.** `box_staff_count.sh` has not been run. No code reaches this item; it needs the live `bin/engine staff import --apply --by <signer>` after deploy, with Nimish's go-ahead. For class- or child-scoped roles the import adds the person but no grant, so this check can fail until someone sets those roles. The dated recount of the sign-in list is still to do.
2. **MET.** `test_signin_list.py` passed. The diff writes nothing to `app.staff`.
3. **MET.** `test_move_enrolment.py` passed. `move_child` finds the class, checks the roll against open enrolment rows, then updates the child and calls `enrol_child` together; if either fails both are undone and the usual refusal is returned. The existing unique index still stops two open rows.
4. **UNCLEAR, box-only, pending.** `box_k2a_rolls.sh` has not been run. A one-time live data fix through `enrol_child` calls after deploy; nothing in the diff does it.
5. **MET.** `test_edit_history.py` passed. Activity INSERT is now kept; link UPDATE writes a removal row and an addition row; a change to only `ord` or `source` writes nothing.
6. **MET.** No new table; `new_tables_owned.py` reports 0 un-owned; `test_no_staff_name.py` passed.

**2. Unasked work**
Nothing of substance: the `_school_class` test helper plus one call in the existing `_move` helper (old move tests need a class now), and the branch note the repo requires. No config edits, renames or new dependencies.

**3. Missing (no plan.md; checked against design.md)**
- The grade guard in `enrol_child` was not built; the builder says why in `docs/notes/CP-1.md` (an existing `test_people.py` case enrols a K2 child into a G3 class on purpose).
- A `test_people.py` case on import grants and a same-day-move / `changed:false` test, listed in the design's implementation list, were not added.
None of these is a Done-when line.

**4. Risks**
- `move_child` now refuses with `no_such_class` when no `school_class` row exists for this school year's grade, section and campus. Check the classes exist on production before deploy.
- Activity inserts now write edit-history rows, so a bulk K2 upload adds many `curriculum_edit` rows (asked for by the scope).
- `move_child` still runs with its owner's rights, as before; grants are kept.
- No secrets, no real people's data, no destructive database changes.

**5. Requirements**
Not provided, so not assessed.

VERDICT: PASS. This holds for the code: items 2, 3, 5 and 6 are met, items 1 and 4 are pending on the box, and the box steps (staff load and K2-A roll fix) must run and pass after deploy before CP-1 counts as done.
