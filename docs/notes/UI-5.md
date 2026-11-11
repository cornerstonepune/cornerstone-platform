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
2. ~~`app_web` cannot write `staff_role_grant`~~ Settled by backend #616 (engine routes `POST /staff/grants`, `/give`, `/end`; a database function was not needed). Built below (UI-5f).

## Proof
`tests/u73-coordinator-pages.spec.ts` (one test per Done-when line the inventory does not carry) and `tests/u70-inventory.spec.ts` (all three screens, both roles where they apply, 1440 and 400). Run locally against a database built from the migrations; the bar test needs the engine API and was left to CI.

## UI-5f: Add a grant, End a grant, and the old Staff page read-only
Branch `ui-5f-grants`. Draft: it is released with backend #615 (sign-in reads grants) and #616 (the routes), migrate first.
- `/setup/staff?person=<id>`: **Add a grant** (role, class, and a subject only for a role held for a subject; from today) and **End a grant** on each open grant of a role the page gives. Both are server actions that ask the engine (`lib/grants.ts`); the roles, classes and subjects offered are the engine's listing, not a list in the site (rule 1). The grant table's own words (`one_per_class`, `core_teacher`, needs a subject, wrong class) come back in the form, never in the address; a clash asks for a reason and the same Save sends it. The controls appear only once a person has been opened (`?person=`).
- "Granted by" shows the coordinator's name (the engine signs with a staff id), not the id.
- `/staff` (old page) is read-only: no Add a person, no class or subject editor, a line saying where to change. Its actions and the add-person form are gone. `requireStaffEditor` stays in `lib/auth.ts` (engine test `test_web_gate` still names it; not mine to change); nothing calls it now.
- Tests: `u74-staff-grants` (nine), `u53` loses the two editor tests (their assertions are u74 1, 5, 8, 9; `goals/uxn2-staff-and-school.yaml` proofs point at the new ones, as `test_promises` requires). Inventory: `Add a grant` / `End a grant` lose `pending`, are driven at `@grants` (a fixture person with one open grant), and the End driver checks the row stays with `valid_to` = today.
- The Staff table's columns were narrowed so the Class column is not squeezed to nothing at 1280 (it was, since #606).
- Still to do after this is live: repoint the menu's Staff to `/setup/staff`, 308 `/staff` to `/setup/staff`, delete the old page, its components and `people()` (plan in #608).
