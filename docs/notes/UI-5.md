# UI-5: the coordinator's pages (staff, classes, setup) — branch note

Issue #520. Branch `ui-5-coordinator`. Built from the approved wireframes `staff`, `classes`, `setup`.

## What is built
- `/setup` (Setup home): the Curriculum action and cards the person's group may open. Educator: Question bank only. Coordinator: Skills to approve, Question bank, Staff, Classes and children, with counts.
- `/setup/staff` (Staff and classes): people grouped by role (role order, then name), the class they hold today, and this fortnight's sessions done of planned. No sort, rank, ordinal, percentage or colour on a number. A person's grants open below the table (read only). Names are shown only to the everything group (`public.my_reach('staff') = 'all'`).
- `/setup/classes` (Classes and children): classes of this year, one class open (`?class=`), its children by Sr. No. with the name read from `pii` by child_id, **Move** (the database's `move_child`: closes the enrolment, opens a new one, writes `change_log`, deletes nothing) and the change log fold.
- `/school` answers 308 to `/setup/classes`. The School menu item opens it.

## Decisions
- `docs/frontend/screens.json`: `UI-5` is in `merged_slices` (so the inventory test runs these screens); filters added to staff and classes (rule 9: a table has its filter row; the repo's `test_ux_rules` forbids a table without one); `data` hooks on the "each …" elements; the search element's text is "Search the list" (what FilterBar says). The wireframes `staff.html` and `classes.html` draw the filter bar, so `check.mjs` still passes.
- Inventory checker: `pending` on an element (a control that waits on a backend piece is not drawn, not required) and a driver for "opens a picker/form" effects. Nothing was loosened.
- Orchestrator's instruction (10 Nov): no score for educators. "Reader accuracy" became whole counts only (notes confirmed, notes late, lines accepted / changed / removed), fixed role-then-name order. Those columns carry no value until the backend gives the counts, so the table hides them (rule 4).
- `/staff` (add a person, classes, subjects) is not in any `folds`, so it stays and keeps the menu's Staff item; the Setup card opens `/setup/staff`.

## Waiting on the backend (comments on #551)
1. `app_web` cannot read `pii.educator_note` / `pii.note_claim`: needs a counts-only view or function for notes confirmed, late, and lines accepted / changed / removed per person.
2. `app_web` cannot write `staff_role_grant` (select only): **Add a grant** and **End a grant** need `grant_role` and `end_grant` security-definer functions. Both elements are `pending` in `screens.json`; remove `pending` and draw the controls when they land.

## Proof
`tests/u73-coordinator-pages.spec.ts` (one test per Done-when line the inventory does not carry) and `tests/u70-inventory.spec.ts` (all three screens, both roles where they apply, 1440 and 400). Run locally against a database built from the migrations; the bar test needs the engine API and was left to CI.
