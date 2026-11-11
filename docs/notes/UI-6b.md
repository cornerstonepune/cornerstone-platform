# UI-6b: the second part of the timetable work

Branch `ui-6b-timetable`, issue #586, draft PR. Scope: `specs/UI-6b/spec.md`. Follows UI-6 (#581, merged as 5ed2908).

## State (11 Nov 2026)

Done and tested (`tests/u75-timetable-b.spec.ts`): Done when 7, the Timetable's Day view is the default at 400 px (`app/(app)/timetable/day-on-phone.tsx`,
a client helper that rewrites the address once; a chosen view is kept; desktop is unchanged).

## Go live (built 11 Nov, after backend #635 / #621 reached main)
- `/api/timetable/golive` (coordinator only, 403 otherwise) goes live for every class with a placed draft for the fortnight, one `POST /timetable/go-live` each, and returns each class's report. A class the engine refuses is named with the engine's own words; the others still go.
- The fortnight page shows Go live only to the coordinator, once the fortnight is approved and has not started, with an optional reason (the engine asks for one once the fortnight is frozen). The what-changed table lists every session moved or removed, by class, and the added count. The engine stores nothing, so the table is kept in this browser (sessionStorage) for the fortnight: a reload keeps it, another browser does not show it.
- The stepper has no "live" step (no fortnight state means live): unchanged, per the orchestrator.
- Tests: `u77-go-live.spec.ts` (3, re-run three times) on its own class U77 and fortnights 7411/7412; the placed draft is kept by `tests/go-live-fixture.py`, run with the engine's own Python, as the engine's own test does. The fortnight is set to approved directly, past the trigger that wants each class settled (settling is the engine's business).
- The journey (4) needs Go live. The inventory drives and `merged_slices` (5) wait for the 12-child fixtures (UI-4 builder will message).
- Per-row Edit on the rules page (6) and retiring the old pages (8, 9, issue #599): `/educator/week`, `/educator` (day), the old rules forms.

## Retiring the old timetable pages (#599): the carry-across plan (11 Nov 2026)

The old pages: `/educator` (Your day), `/educator/week` (This week), `/educator/period/[id]` (superseded by UI-3's `/period/[id]`), the old
`/timetable/rules` forms. `/educator/materials*` belongs to UI-9, not here. Specs that touch them: `m1-09-calendar`, `m1-09-activity`, `m1-09-tokens`,
`s1-site-answers` (menu list), `u13-frame` (route list), `u13-route-walk`.

Where each old behaviour lands (every old assertion moves, none dropped):

| Old test | New home | Needs first |
|---|---|---|
| a day that is not a date is not found | `/timetable?day=` (already: `isDay`) | nothing |
| switched off: Today, This week, a period not found | `/timetable`, `/period/[id]` (the engine gate, already) | nothing |
| the day as a calendar: blocks in time order, time as time, the school's words, a chip only on work | Day view of `/timetable` | state chips and the Now marker on cells (`chipOf`, `now`), which FortnightGrid already draws |
| the week is a grid, a holiday one cell, days stack on a phone | Week view | a holiday day marked in words under the grid |
| any block opens its period | `/period/[id]` (cells link there) | the cell's session id, not the old `/educator/period/<period id>` |
| her menu: sidebar on desktop, tabs on a phone | the frame (UI-13), tested there | nothing |
| today's column grey, no future cell carries a chip | Week/Fortnight view | chips as above |
| tokens, chip contract, Now line, `isDay` (`m1-09-tokens`) | unit tests of `lib/educator/*` kept; the directory scan follows the new files | decide where `lib/educator/chip.ts`, `period.ts` live once `app/(app)/educator` is gone |

## Two things the SPEC does not list (asked of the orchestrator, 11 Nov)
1. **Previous / next day and week, and "today".** The old pages step through days and weeks; the Timetable's listed controls are only the class
   filter, the Day / Week / Fortnight tabs and this / next fortnight. Moving to another day inside the fortnight needs either a control added to
   `screens.json` or the day heads becoming links (a day head already exists as a cell of the grid).
2. **An educator with more than one class.** The old pages let her pick her class; the SPEC makes the class filter the coordinator's only.


## Decision (orchestrator, 11 Nov 2026): both yes, "no function is lost"
- Day heads link to their day; "Today" is a listed control; stepping to earlier or later days is the same day heads (`screens.json`, `SPEC.md` updated here).
- An educator holding more than one class keeps a class picker (only then); the coordinator always has it.

## Built so far for the retirement (all in `/timetable`, tests in `u75-timetable-b.spec.ts`, 7 pass, run twice)
Day heads open their day; Today; a cell opens `/period/<its session id>`; Done / Late / Do now chips on work and none ahead; holidays named in words under
the grid; the class picker for an educator with two classes. Next: move the old calendar specs' assertions onto these views, then 308 and delete the old pages.
`FortnightGrid` gained an optional `dayHrefs` (no visible change without it). The block-gallery screenshots fail on this machine on any branch (fonts); CI draws the baselines.

## Walkthrough defect: grid clipped at 1440, every subject amber (11 Nov)
- **Clipped column.** Ten day columns at a 150px minimum are wider than the page, so the right-hand days sat out of sight inside the grid's own scroll box. From 1100px up the day columns now share the width (cells a little tighter); below that the 150px minimum and the box's own sideways scroll stay, and the day view is the phone default. Proof: `tests/u78-timetable-fit.spec.ts` (fortnight and week at 1440: all columns whole, nothing to scroll; 400: day view fits, no view scrolls the page).
- **Everything amber.** The colour is looked up from config `timetable.subject_looks` by subject code. The seeded row is keyed `NUM` and `ENG`, but the school's real timetable uses lowercase codes (`math`, `english`, `hindi`, `phonics`, `reading`, `story`, `rhymes`, `art`, `music`, ...), so nothing matches and every block falls back to arts (amber). Fix is the seed row (backend lane, `supabase/seed/config.json`, and `seed_once` means the live row also needs updating); the screen already reads it. Only three subject colours exist (numeracy, language, arts), so "each subject its own colour" means each *family*, not 19 hues.

## The five screens to their wireframes (11 Nov, branch ui-6c-wireframes)
- **Timetable:** the legend (Done, Moved by hand, Clash), the "Changed this fortnight" rail panel (open clashes, last hand moves), "This fortnight, lessons by subject" against the class's limit rules (`lib/timetable-subjects.ts`), the fortnight in the eyebrow, rail links drawn for the slice's own pages (`href`, so they show before the slice is in `merged_slices`).
- **Fortnight:** three cards (State with the steps taken as a timeline, Plan lines with their activity, Hand moves), the Go live sentence, a rail of the plan's activities, and "Every fortnight of the year, by state" as the KanbanBoard (five lanes, the fortnight's real states; the wireframe's "Live" lane is still pending because no fortnight state says it).
- **Draft:** the fortnight chosen from a list, a status chip for the draft ("Drafted with N rules not met"), "Last drafts by class", a rail "What the draft reads" (period times, fixed slots, blocked days, limits, plan lines).
- **Moves:** the three-mark legend, the rail "This draft so far", each clash as its own Accept form (Reason, helper line, button).
- **Rules:** read-only tables (Period times and fixed slots, Blocked days, Subject limits) with an Edit per row; Edit opens that row's fields with Save and Cancel (`?edit=<id>`, no script). A blocked day has no field edit in the engine, so its Edit offers Remove; to change one, remove it and block the new day. The add forms sit under "Add a rule". `m1-14a-timetable-rules.spec.ts` now clicks Edit first; every assertion it made is kept.
- **Block change (shared):** a grid or board wider than the page now shares the width at 1100px and up (`b-many`: a grid of more than five days, a board of more than four lanes), so no column sits out of sight; the gallery samples are narrower and their pictures do not change.
- Proof: `tests/u79-timetable-wireframes.spec.ts` (7 tests).


## Retirement, step 2 (branch `ui-6b-retire`, on top of #633): stepping and the 404s (`u76-timetable-steps.spec.ts`, 5 tests, run twice)
- Previous / next day (weekends skipped) and previous / next week; a day named in the address chooses the fortnight, so stepping crosses a fortnight's edge.
- Found on the way: the Timetable picked a fortnight by date alone; when two academic years have a fortnight on the same day it could show the wrong one. A named class now keeps the fortnight in its own year (`fortnightAt(day, classId)`).
- "Switched off, not found" is true for an educator; the staff preview (a coordinator, while a class has lessons today) may look. The old test did not meet that case because no class had lessons that day.
- Moved so far from `m1-09-calendar`: not-a-date 404, switched-off 404, the day stepping with the weekend skipped and the holiday message. Still to move: times as ranges, the colour legend, the counts line, the next-period aside, the Now line, week stacking on a phone, today's column, the period page's parts (UI-3's `/period/[id]`).

## Retirement, step 3 (branch `ui-6d-retire`): the old pages are gone
- `/educator` (Your day), `/educator/week` (This week) and `/educator/period/[id]` answer 308 to the Timetable (`next.config.ts`, the class and day they name carried over); their pages, the unused `components/educator/block.tsx`, and the menu entries "Your day" and "This week" are deleted. The Timetable door opens `/timetable`. `/educator/materials*` stays (UI-9).
- The Timetable gained what the old pages did and it lacked: a lesson row's time as a range (`09:40–10:20`), a fixed part of the day as a band with its start, a counts line (`[data-summary]`: lessons and holidays), a Day view "next" line (`[data-next]`: the next period, or "This day is over."), and Do now and Late in the legend. The wireframe's legend is drawn with them.
- The Period screen's "Open the activity" carries `?back=/period/<id>`; the activity's next step says "Back to the period" (it said "Back to the day" for the old page).
- Specs moved with equal assertions: `m1-09-calendar` (now on the Day and Week views, plus the 308s), `m1-09-activity` (the period → activity → back test), `s1-site-answers`, `u13-frame`, `u13-route-walk`. Not kept, by design, and said at the top of `m1-09-calendar`: the sand/ivory/cream fill check (old look), the "Free" word on an empty period (the wireframe draws a blank cell), stacked days on a phone (the phone opens the Day view).

## What is unfinished in the timetable slice (11 Nov, end of week)
1. **Coordinator's journey** (`e2e/the-coordinators-fortnight.spec.ts`, #586): draft → move → approve → go live as one walk. Not written.
2. **Inventory drives and `merged_slices`**: add UI-6 to `merged_slices` in `docs/frontend/screens.json` once the 12-child inventory fixtures land (do not edit `tests/inventory-fixtures.ts`); the timetable rail links already draw through `href` until then.
3. **Subject colours (backend)**: seed `timetable.subject_looks` keyed by the real lowercase subject codes (`math` → numeracy; `english`, `hindi`, `phonics`, `reading`, `story`, `rhymes` → language; the rest arts) and update the live row (`seed_once`). Until then every block draws amber.
4. **Fortnight "Live" lane**: the wireframe draws a Live lane; no fortnight state says it. Needs a backend state or a decision to drop the lane.
5. **A blocked day's own Edit**: the engine has no field edit for a block, so Edit offers Remove only.
6. **Old timetable pages**: nothing left in code (`/educator`, `/educator/week`, `/educator/period/[id]` are deleted and 308) once #685 merges. `/educator/materials*` stays for UI-9.
