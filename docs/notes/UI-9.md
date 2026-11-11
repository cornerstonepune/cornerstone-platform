# UI-9: Materials, this fortnight (read only)

Branch `ui-9-materials`, issue #593. Scope: `specs/UI-9/spec.md`. Tests: `apps/web/tests/u74-materials.spec.ts`.

## State (10 Nov 2026)
Built: `/timetable/materials` (span filter, lines with the amber "to confirm" chip, activity links, "Notes to read" filter,
My class / School list tab for the coordinator, rail). Reads only the existing `/materials/*` routes; no engine or database change.
Not run locally (no database in the builder's container): the first run is CI's. UI-9 is NOT in `merged_slices`, so the
inventory test does not yet run its 10 controls (same as UI-4). `/timetable/materials` is in `workflows.json` screens.

## Inventory pending list (controls of screens.json `materials` not on this screen yet)
| Control | Why |
|---|---|
| field: quantity (each line) | Writes via `/materials/line/quantity`. Stays on the old page; UI-9b moves it with m1-09 specs on equal assertions |
| button: Remove (each line) | Same: `/materials/line/remove`, old page until UI-9b |
| button: Add from the catalogue | Same: `/materials/line/add`, old page until UI-9b |
| upload: capture Photo | No store for a materials photo yet (backend adding `photo_keys`) |
| approval (CP-17) | Not built; approval-only, backend |
| links to activity / Fortnight 9 | Drawn to the old activity page now; the new activity and fortnight screens (UI-6, UI-11) are not built, so the rail edges appear when they are |
| Not built, by decision (10 Nov) | stock counting, sending, reminders, email, WhatsApp |

## Data gaps for the orchestrator
None found. (Photo: `photo_keys` already known.)

## CI (10 Nov)
First full run: only red was my test 4 (the educator I made held no grant on the class, so the page rightly 404'd; fixed with a class_teacher grant) and the known u71 growth-page speed test. The menu now lights Materials, not Timetable rules, on this page.
