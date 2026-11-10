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
2. `app_web` cannot write `staff_role_grant` (select only): **Add a grant** and **End a grant** need `grant_role` and `end_grant` security-definer functions. Both elements are `pending` in `screens.json`; remove `pending` and draw the controls when they land.

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
| 3 | **Add a member of staff** (name, school email, role; "Add and send a link") | `public.staff_add`, then a first-time password link by email; refuses a bad email, an unknown role, an email already on the list | no home in `screens.json` yet: a fold "Add a person" under the table on `/setup/staff` (not the main action; the main action stays Add a grant). `staff_add` and the link email already exist | **carry across, frontend only, can start now** (one PR: inventory element + wireframe + page + move the spec below) |
| 4 | **Classes they teach**: tick classes, "Save the classes" | writes `staff.classes`; refuses a class no child is in | Add a grant / End a grant (`staff_role_grant`) | **needs backend: `grant_role` / `end_grant`**, and see the scope finding below |
| 5 | **Subjects they teach**: tick subjects, "Save the subjects" | writes `staff.subjects` | the same grants (a grant names its subject) | **needs backend**, same as 4 |
| 6 | Notices: saved, "only the coordinators can change the staff list", refused | words after a save | the grant form's own messages (`needs_class`, `needs_subject`, `already_holds`, `one_per_class`, `core_teacher`, `wrong_scope`) | with 4 |
| 7 | Links "See the school's classes" and the next step | navigation | `/setup/classes` (already) | done |

**Finding that decides the order.** Every page's "a person sees their own" reads `staff.classes` and `staff.subjects` (`lib/scope.ts`, `lib/reach.ts`), and the old `/staff` editor is the only thing that writes them; grants are read only by `public.my_reach` and the access groups. Retiring rows 4 and 5 therefore needs one decision for the backend and the orchestrator, before the page can go: either (a) the columns are derived from grants (a view or a trigger on `staff_role_grant`), or (b) `lib/scope.ts` and `lib/reach.ts` read the grants (through `my_ids`). Without it, ending a grant would change nothing an educator sees.

### Specs to move, at equal assertions
| Spec (today) | Assertion | Moves to |
|---|---|---|
| `u53-staff-and-school` test 1: "a coordinator ticks a person's classes … the list keeps them, and the rest of the person" | the write lands; the person's password hash and role are untouched; no `scrypt$` in the page | `/setup/staff` grant test: a grant row is written, the person's other data is unchanged, the page never shows a hash. The **no hash in the page** half can move now (a read-only test on `/setup/staff`). |
| `u53` test 2: "a class no child is in refuses everything, and the filter row finds a person" | an unknown class changes nothing; the filter row finds a person | the filter half: now, on `/setup/staff` (not yet tested there); the refusal half: with grants (the trigger already refuses what the form cannot offer) |
| `u53` test 3 (School) | class, grade, children, educators | already on `/setup/classes` (#576) |
| `gate-password`: "a new member of staff added on the Staff page has no password and is sent a first-time link" | no password row; a first-time link is sent | with row 3, on `/setup/staff`, same assertions |
| `u67-guide`: help from the Staff page opens its guide | the "?" opens the page's guide | repoint `/staff` to `/setup/staff` when the menu item moves; `guide/pages/staff.json` (`menu`, text, quoted buttons) rewritten with it (`test_guide.py` holds the quoted buttons) |
| `u60-ui-wave-1-flow`: `wholePage("/staff", /Staff/)` | the page passes the whole-page checks | `/setup/staff`, `/Staff and classes/` |
| `u13-route-walk` / `u53-the-menu` | the door and page a route belongs to | the menu entry `/staff` becomes `/setup/staff` |

### Order
1. **A. Add a person** on `/setup/staff` (row 3), with its spec moved. Frontend only; no backend needed.
2. **B. Backend:** `grant_role` / `end_grant` (comment on #551) and the scope decision above.
3. **C. Grants on `/setup/staff`:** Add a grant / End a grant (remove `pending` in `screens.json`, draw the controls), move the `u53` tests, point the menu, guide page and `requireStaffEditor` at `/setup/staff`.
4. **D. Retire:** `/staff` answers 308 to `/setup/staff`; delete the page, `staff-table`, `add-person`, `actions.ts` (setClasses / setSubjects / addPerson), the unused parts of `lib/queries-staff.ts`, and `guide/pages/staff.json`'s old text. The `test_layout` map stays in step.

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
