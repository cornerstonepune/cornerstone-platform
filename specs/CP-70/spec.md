# CP-70: Curriculum is editable in place, and the activity page is rich

Issue #837. Approved by Nimish in chat on 17 Nov 2026 and recorded on the issue by the orchestrator.

## What

Every part of Curriculum can be edited where it is shown, by a coordinator, and is live at once (no approval queue).

- **An objective** (title, subject, unit, grades). An objective can sit in more than one grade: Nimish's example is a Grade 2 Maths
  objective that is also placed in Grade 1 or Grade 3. It stays one objective (one row, one set of links, one history); it is shown
  under each of its grades, in the same subject and unit.
- **An activity** (name, steps, materials, the four rubric levels, the skills and objectives it is tied to, and its grades), with add
  and remove for skills, objectives and grades.
- Every edit is kept (who, when, from, to) and can be taken back one step.

## Design decisions (reuse before add)

1. **Extra grades are data on the existing row, not a table.** `learning_objective.band` stays the objective's home grade; a new
   column `learning_objective.also_bands text[] not null default '{}'` holds the others. `activity` gets the same column for the grades
   an activity is tagged to beyond its own `band`. Why not a link table: a grade is a short code, the tree reads a grade's objectives in
   one query (`band = g or g = any(also_bands)`, with a GIN index), and a link table would add a join to the one read CP-72 made fast.
   No new table; `supabase/table-budget.json` does not move.
2. **History is `change_log`, not a new table.** `internal.change_kept` already writes one row per change on `learning_objective`,
   `activity`, `activity_skill`, `activity_objective` and `learning_objective_skill`. The migration widens what two of those watch:
   an objective's `band`, `subject_code` and `also_bands`, an activity's `band` and `also_bands` (today they miss the grade and the
   subject code, which is what the tree reads).
3. **A person's edit is never overwritten** by what already exists: a reload skips any row whose history names a staff member
   (`by_a_person`), and an objective edited by a person has `source = 'person'` (the check already allows it). Activities have no
   `source` column; "person-made" for an activity is read from its history, not a new column.
4. **Undo is one step back per edit, as a new row.** It restores the `before` of a change, and is refused, in a plain sentence, when
   a later change touched the same field of the same row. Nothing in `change_log` is ever edited or deleted.
5. **Who may edit:** the roles of the setting `curriculum.review_roles` (head, coordinator), checked in the engine on every write;
   the website's route handlers also call `requireStaff`. Everyone else reads.
6. **One grade must stay.** Removing the home grade makes the first extra grade the home grade; removing the last grade is refused.
   An objective is never deleted by removing a grade. A grade must be a row of `grade`.
7. **Subject.** The tree groups by `subject_code`, and `subject` is the older label text; an edit sets both from the `subject` table
   so they cannot disagree.

## Done when

1. The engine door `POST /curriculum/edit/objective` changes an objective's title, subject and unit, and a person's edit is kept: the row reads
   `source = 'person'`, and a seed reload (`apply_seed`) leaves it as it was.
2. Adding a grade to an objective puts it under that grade's tree (same subject and unit) and in that grade's counts; removing a grade
   takes it out there. The objective is not deleted, and its other grades, links and history are untouched.
3. The last grade of an objective cannot be removed; removing its home grade promotes the next one; an unknown grade is refused.
4. The activity door changes an activity's name, steps, materials and the four rubric levels, adds and removes its skills,
   objectives and grades, and a reload leaves a person's change.
5. Every edit is a `change_log` row with who, when, before and after; the history of one objective or activity can be read.
6. Undo takes back one edit as a new row, and is refused with a plain sentence when a later edit touched the same field.
7. Only the roles of `curriculum.review_roles` can write; anyone else gets 403 with nothing written. The website's routes call
   `requireStaff` and call `curriculumChanged()` after every write, so the tree shows the edit at once (a test reads the tree
   before and after, with no wait).
8. The objective panel on the Curriculum tree edits title, subject, unit and grades in place, with no server round trip on
   expand and collapse; at 400 px the panel is a sheet and the edit works.
9. The activity page shows name, steps, materials, the four rubric levels, linked skills, linked objectives and grades, each
   editable, with add and remove; at 400 px it works and nothing scrolls sideways.
10. `u90` passes on both screens (shared components and tokens, one Card, three sizes), and each Done-when has one test, the core
    ones inside the budget `test_core_budget.py` holds.

## Out of scope

- Creating or deleting an objective or an activity (this is editing what exists, and linking it).
- An approval queue for edits; edits by educators who are not coordinators.
- Editing the frameworks (`objective_statement`) from these screens.
- Changing how the machine makes curriculum rows.
- More than one step of undo at a time.

## How it ships

1. **PR 1:** this spec, the one migration, the engine door (`w1_bank/curriculum_edit.py`, `api/routes/curriculum_edit.py`) with
   history and undo; Done when 1 to 7 (engine part).
2. **PR 2:** the objective panel and grades on the tree; Done when 2 (tree), 7 (site), 8.
3. **PR 3:** the activity page; Done when 9.
Each with impeccable's audit and 1440 and 400 px screenshots.
