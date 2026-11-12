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
1. ~~Per-person note counts~~ — done: backend #600's `POST /reports/counts`, shown on `/setup/staff` by #606 (notes confirmed, notes late = left unconfirmed, lines accepted / changed / removed; whole numbers, hidden when empty).
2. ~~`app_web` cannot write `staff_role_grant`~~ Settled by backend #616 (engine routes `POST /staff/grants`, `/give`, `/end`; a database function was not needed). Built below (UI-5f).

## Proof
`tests/u73-coordinator-pages.spec.ts` (one test per Done-when line the inventory does not carry) and `tests/u70-inventory.spec.ts` (all three screens, both roles where they apply, 1440 and 400). Run locally against a database built from the migrations; the bar test needs the engine API and was left to CI.

## Retirement plan for the old Setup and School pages (decision #599, 10 Nov 2026)

Rule of #599: the old route answers **308** to the new address, then the old page, its components, queries and styles are deleted; a spec is deleted only when the same assertion lives on the new screen, otherwise it is moved. A removal that would cost the school a function it has today is raised before it is done. Nothing here changes a table or a migration.

### Done
- **`/school`** (#576): answers 308 to `/setup/classes`; its page is deleted. Specs repointed with the same assertions: `u53` ("School shows each class…"), `u60`, `p6`, `u13-frame`. The menu item "School" opens `/setup/classes`.

### The old `/staff` page (not yet retired)
Files: `app/(app)/staff/{page,staff-table,add-person}.tsx`, `app/(app)/staff/actions.ts`, `lib/queries-staff.ts` (`people`, `classLines`; `rolesHeld` is used by Add a person), `guide/pages/staff.json`, the menu item "Staff" (`lib/menu.ts` → `/staff`), `lib/auth.ts` `requireStaffEditor` (sends a refused person to `/staff?denied=1`).

| # | Control on the old page | What it does today | New home | Status |
|---|---|---|---|---|
| 1 | Filter row: Role, "Find a person" | narrows the people | `/setup/staff` has both | **done** (#576) |
| 2 | Table: Person, Role, Classes they teach, Subjects they teach | lists staff with their `staff.classes` / `staff.subjects` | `/setup/staff`: name, role, class (from grants), sessions, counts | **done** (display) |
| 3 | **Add a member of staff** (name, school email, role; "Add and send a link") | `public.staff_add`, then a first-time password link by email; refuses a bad email, an unknown role, an email already on the list | no home in `screens.json` yet: a fold "Add a person" under the table on `/setup/staff` (not the main action; the main action stays Add a grant). `staff_add` and the link email already exist | **done** (#612: button and form on `/setup/staff`, spec moved at equal assertions) |
| 4 | **Classes they teach**: tick classes, "Save the classes" | writes `staff.classes`; refuses a class no child is in | Add a grant / End a grant (`staff_role_grant`) | **built in #628 (draft)** against backend #616's routes; released with #615/#616, migrate first. Scope decided in #590 (see below) |
| 5 | **Subjects they teach**: tick subjects, "Save the subjects" | writes `staff.subjects` | the same grants (a grant names its subject) | **built in #628**, same as 4 |
| 6 | Notices: saved, "only the coordinators can change the staff list", refused | words after a save | the grant form's own messages (`needs_class`, `needs_subject`, `already_holds`, `one_per_class`, `core_teacher`, `wrong_scope`) | in #628: the engine's own words, shown in the form |
| 7 | Links "See the school's classes" and the next step | navigation | `/setup/classes` (already) | done |

**Finding that decides the order.** Every page's "a person sees their own" reads `staff.classes` and `staff.subjects` (`lib/scope.ts`, `lib/reach.ts`), and the old `/staff` editor is the only thing that writes them; grants are read only by `public.my_reach` and the access groups. Retiring rows 4 and 5 therefore needed one decision. **Decided (#590, backend): grants become the one source of scope** (no new table), after a data backfill from the old columns; backend #615 makes the sign-in read grants. Until #615 is live the old page keeps reading the columns and is read-only (#628).

### Specs to move, at equal assertions
| Spec (today) | Assertion | Moves to |
|---|---|---|
| `u53-staff-and-school` test 1: "a coordinator ticks a person's classes … the list keeps them, and the rest of the person" | the write lands; the person's password hash and role are untouched; no `scrypt$` in the page | `u74` test 1 (#628): a grant row is written, the person's password and role are unchanged, the page never shows a hash |
| `u53` test 2: "a class no child is in refuses everything, and the filter row finds a person" | an unknown class changes nothing; the filter row finds a person | both in `u74-staff-grants` (#628): the filter row (test 9) and a class not on the list refused with nothing changed (test 5) |
| `u53` test 3 (School) | class, grade, children, educators | already on `/setup/classes` (#576) |
| `gate-password`: "a new member of staff added on the Staff page has no password and is sent a first-time link" | no password row; a first-time link is sent | **moved in #612**, same assertions |
| `u67-guide`: help from the Staff page opens its guide | the "?" opens the page's guide | repoint `/staff` to `/setup/staff` when the menu item moves; `guide/pages/staff.json` (`menu`, text, quoted buttons) rewritten with it (`test_guide.py` holds the quoted buttons) |
| `u60-ui-wave-1-flow`: `wholePage("/staff", /Staff/)` | the page passes the whole-page checks | `/setup/staff`, `/Staff and classes/` |
| `u13-route-walk` / `u53-the-menu` | the door and page a route belongs to | the menu entry `/staff` becomes `/setup/staff` |

### Order
1. **A. Add a person** on `/setup/staff` (row 3), with its spec moved. **Done (#612).**
2. **B. Backend:** the grants routes (#616, engine routes; no database function was needed) and the sign-in reading grants (#615). **In review.**
3. **C. Grants on `/setup/staff`:** Add a grant / End a grant, the `u53` tests moved, the old editor made read-only. **#628, draft**, released with B. Still to do here: point the menu, guide page and `requireStaffEditor` at `/setup/staff`.
4. **D. Retire (after #615 is live):** `/staff` answers 308 to `/setup/staff`; delete the page, `staff-table`, `add-person`, `actions.ts` (setClasses / setSubjects / addPerson), the unused parts of `lib/queries-staff.ts`, and `guide/pages/staff.json`'s old text. The `test_layout` map stays in step.

### Other old Setup pages still routed (not UI-5's; owner from `screens.json`)
| Old route(s) | New screen | Slice |
|---|---|---|
| `/`, `/curriculum/browse`, `/curriculum/fill`, `/curriculum/offers`, `/asks` | `/setup/curriculum` | UI-11 |
| `/skill-sets/approve`, `/skill-sets/levels` | `/setup/skills/approve` | UI-11 |
| `/library`, `/worksheets`, `/worksheets/taxonomy` | `/setup/question-bank` | UI-11 |
| `/library/[key]` | `/setup/question-bank/[key]` | UI-11 |
| `/educator/activity/[code]`, `/curriculum/fill/[code]`, `/curriculum/fill/walk` | `/setup/activities/[code]` | UI-3 |
| `/skill-sets/[code]`, `/skill-sets/[code]/edit` | `/setup/skills/[code]` | UI-3 |
| `/guide/[slug]`, `/guide/workflows`, `/workflows` | `/guide` (help) | UI-12 |

The Setup home (`/setup`) and the Setup door already open the new frame. Until UI-11 merges, `/setup` links Curriculum, Skills to approve and Question bank to these old pages by their old addresses (`lib/built.ts` falls back), so no card is a dead link; when UI-11 merges those links switch to the new screens by themselves.

## UI-5f: Add a grant, End a grant, and the old Staff page read-only
Branch `ui-5f-grants`. Draft: it is released with backend #615 (sign-in reads grants) and #616 (the routes), migrate first.
- `/setup/staff?person=<id>`: **Add a grant** (role, class, and a subject only for a role held for a subject; from today) and **End a grant** on each open grant of a role the page gives. Both are server actions that ask the engine (`lib/grants.ts`); the roles, classes and subjects offered are the engine's listing, not a list in the site (rule 1). The grant table's own words (`one_per_class`, `core_teacher`, needs a subject, wrong class) come back in the form, never in the address; a clash asks for a reason and the same Save sends it. The controls appear only once a person has been opened (`?person=`).
- "Granted by" shows the coordinator's name (the engine signs with a staff id), not the id.
- `/staff` (old page) is read-only: no Add a person, no class or subject editor, a line saying where to change. Its actions and the add-person form are gone. `requireStaffEditor` stays in `lib/auth.ts` (engine test `test_web_gate` still names it; not mine to change); nothing calls it now.
- Tests: `u74-staff-grants` (nine), `u53` loses the two editor tests (their assertions are u74 1, 5, 8, 9; `goals/uxn2-staff-and-school.yaml` proofs point at the new ones, as `test_promises` requires). Inventory: `Add a grant` / `End a grant` lose `pending`, are driven at `@grants` (a fixture person with one open grant), and the End driver checks the row stays with `valid_to` = today.
- The Staff table's columns were narrowed so the Class column is not squeezed to nothing at 1280 (it was, since #606).
- Still to do after this is live: repoint the menu's Staff to `/setup/staff`, 308 `/staff` to `/setup/staff`, delete the old page, its components and `people()` (plan in #608).

## UI-5h: the old /staff page goes; Staff, Classes and Setup to their wireframes
Branch `ui-5h-staff-classes-setup` (after #628 and #657).
- **Retired:** `/staff` answers 308 to `/setup/staff` (carrying its query); `app/(app)/staff/{page,staff-table}.tsx` and `people()` are deleted; the menu's Staff opens `/setup/staff`; `guide/pages/staff.json` is keyed to it; `screens.json` `staff.folds` names `/staff`. `u12` holds the 308; `u74` 8 holds it and the query; `u60` walks `/setup/staff`. **Left:** `requireStaffEditor` in `lib/auth.ts` (nothing calls it; the engine test `test_web_gate` still names it, so backend drops that test first, then it is deleted).
- **Staff** (wireframe `staff`): each role group's heading carries its count (`DataTable counted`, opt-in); the stage line names the fortnight and the staff count; "Last changes to grants" lists the latest gives and ends, newest first, from `change_log`, with who and when (names from the staff list, `pii`, everything group only).
- **Classes** (wireframe `classes`): a Class picture link on each class row (drawn once the picture screen is built, like every link to an unbuilt screen); a class's children in two groups, "Moved in this year" first, then "Here since the year began", each with its count; the change log line reads `By <name> · 11-Nov`. The change log keeps the time of the change, not an effective date, so no "from" date is shown (it would repeat the same day).
- **Setup** (wireframe `setup`): a School card (campus, this academic year, fortnights by kind as the rows name them) and "Changed lately" (a child moved class, a grant added or ended; these are the two kinds the change log holds for Setup's pages). **Not done:** the Curriculum and Question bank count lines of the wireframe's cards (`212 activities`, `3,140 ready`): they need counts from tables this slice does not own.
- Tests: `u77-staff-classes-setup` (4). `.note` (12 px grey) fails the contrast check on these screens, so the new small lines use the muted ink the tabs use.

## Unfinished in UI-5 (11 Nov 2026, work stopped; one short list)
1. **#670 itself**: needs main merged in (only generated files conflict: `help.json`, `wireframes.html`; regenerate with `node docs/frontend/build-spec.mjs`, `node apps/web/scripts/tokens.mjs`), the affected specs run on a fresh database, then merged on green. Held for the orchestrator's GO.
2. **Delete `requireStaffEditor`** from `lib/auth.ts` once backend drops its line from `test_web_gate`; nothing calls it.
3. **Setup cards**: the Curriculum and Question bank cards lack the wireframe's count lines (`212 activities`, `3,140 ready`, `14 drafted parts`); "Changed lately" shows only child moves and grant changes (the change log holds no skill-approval or question-wording rows for Setup).
4. **Classes**: the Class picture link shows once the picture screen (UI-3b) is built; the change log has no effective date, so no "from 3-Nov".
5. **Staff wireframe details not built**: a "What the counts are" explainer, role labels carrying the subject (`Subject educator (Arts)`), a "From" date and a "Held twice" message in the Add a grant form (a grant starts today only, by the engine's rule).
6. **Axe, moderate (not blocking)**: a grouped table's group heading is an `h3` straight after the page `h1` (heading order); the shared `DataTable` grouping needs an `h2`.
7. The old `staff.classes` / `staff.subjects` columns stay (decision); nothing in the site writes them.
