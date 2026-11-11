# UI-6b: the second part of the timetable work

Branch `ui-6b-timetable`, issue #586, draft PR. Scope: `specs/UI-6b/spec.md`. Follows UI-6 (#581, merged as 5ed2908).

## State (11 Nov 2026)

Done and tested (`tests/u75-timetable-b.spec.ts`): Done when 7, the Timetable's Day view is the default at 400 px (`app/(app)/timetable/day-on-phone.tsx`,
a client helper that rewrites the address once; a chosen view is kept; desktop is unchanged).

## Waiting
- Go live and the what-changed table (Done when 1 to 3): the engine's `POST /timetable/go-live` is backend draft PR #621 (not on main). It answers the report once
  (nothing is stored), so the fortnight page shows it from the response. Built against #621's branch for local runs.
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
