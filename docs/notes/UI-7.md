# UI-7: Today, both kinds

Branch `ui-7-today`, issue #595, playbook #591. Scope: `specs/UI-7/spec.md`.

## Decision: beside the old page, at `/today/new`
`/today` is the old "What needs doing" page. It holds controls no Today element lists (taught switches, the task groups) and about 30
older specs open it, so (as UI-4 did) this slice redirects nothing. Both screens are at `/today/new` (screens.json routes changed
from `/today`; SPEC.md regenerated) and are in the menu as "Today, new look". UI-7b swaps the address, moves the old specs, puts
`UI-7` in `merged_slices` (sign-in then lands here) and makes the Today badge the strip's do-now plus this-week.

One address serves both versions. The group decides: `schoolVersion` (`lib/today-data.ts`) asks `reachOf`, the database's one rule; no
role is named. Two screens on one address are two versions, so `u70-inventory.spec.ts` holds each to its own role (`rolesOf`).

## Built (educator)
Strip (do now = notes left unconfirmed, this week = notes waiting, done = periods taught of planned), List | Board toggle (the address
carries it), the day's periods in order with the lit one (`litPeriod`: the lesson holding the current time; a break is never lit),
board lanes whose counts are the tiles' numbers, Cards (Notes to confirm; Your class with the class picture), rail, main action
(the period now, else the next). Data: `/k2/todo` (her notes by state and age, across days), `/timetable/day`, `/k2/picture`.

## Built (school)
Strip with do-now = notes left unconfirmed across classes (`/k2/coordinator`) and the waiting table with that one row. Everything else
waits on counts the web cannot read (below) and does not appear.

## Doors: drawn by the day their target is built (`lib/today-doors.ts`)
A door is the new screen when its slice is in `merged_slices` (`lib/built.ts`), else the old page that does the work when one is live,
else nothing. On main now none of these targets is built. Unbuilt, with the old page used meanwhile:
| Door | Target (PR) | Meanwhile |
|---|---|---|
| do now tile, note cards, Confirm the first | confirm `/notes/[id]` (UI-3a #571) | `/voice/notes/[id]` |
| this week tile | notes `/notes` (#571) | `/today?open=notes` |
| done tile, Class picture | picture `/children/[class]` (UI-3b #570) | `/k2/[class]` |
| period rows and cards | period `/period/[id]` (#571) | `/educator/period/[id]` |
| rail: This fortnight, Timetable | timetable (UI-6 #581) | `/educator/week` |
| rail: Materials | materials (UI-6/UI-9) | `/educator/materials` |
| rail: Staff and classes | staff (UI-5 #576) | `/staff` |
| moves, draft, fortnight | UI-6 #581 | not drawn |
| new activity next week | activity (UI-3c #577) | not drawn |
| peek (Your class children, Close, Open the child, name) | UI-3b #570, UI-3c #577 | `pending` in screens.json |

## Data gaps (asked of the orchestrator, 10 Nov)
The school's Today needs counts the web cannot read: clashes not accepted, drafts to approve, materials lines without a quantity, last
week's sessions by class and day (heat grid, holidays), consent on file, next week's new activities. Those elements are `pending` in
screens.json with that reason; the strip's other two tiles and the heat grid return with them.
