# UI-6b: Go live, what changed, the coordinator's journey, the inventory drives and retiring the old timetable pages

Issue #586.

Tier 2. Split from UI-6 (#580, PR #581). Waits for: the engine's coordinator-only Go live route (it returns the what-changed report, no table; queued with the backend) and PR #578 (drivers) on main.

### In plain English

The last part of the timetable work: the coordinator's Go live button on the fortnight page, the table that lists every session it changed, and the proofs that walk the whole fortnight as the coordinator.

### What

Go live on the fortnight page, calling the new engine route (the website checks the coordinator group first and answers 403 to anyone else). The what-changed table fills from the route's report. `drive` hints for the stateful buttons in screens.json, the pending list cleared, and `UI-6` added to `merged_slices`.

### Done when

1. Go live updates sessions in place and lists every changed session on the fortnight page; a hand move after freeze is kept with who and why and shows amber on the grid (database and DOM).
2. Fortnight 9: Go live exists for the 'everything' group only and its request is refused (403) for others; a frozen fortnight shows no Go live.
3. Fortnight 9: the what-changed table lists every session the go-live updated, and nothing else.
4. The journey `e2e/the-coordinators-fortnight.spec.ts` passes: Today (coordinator) → the red clash row → Moves → accept with a reason → Fortnight → Approve → Go live → Timetable shows the change as educator; axe at each step.
5. Every one of the 42 controls listed for the five UI-6 screens in docs/frontend/screens.json behaves as its kind says, proved by the inventory test; `UI-6` is in `merged_slices` in the slice's last commit.
6. The rules page: each row has its own Edit that turns the value into a field, with Save and Cancel (the current page edits in place; its spec `m1-14a-timetable-rules` moves with it, same assertions).
7. Timetable: at 400 px the Day view is the default.
8. No old timetable page stays active (Nimish's decision, issue #599): every control of `/educator/week` and `/educator` (day), and of the old `/timetable/rules` forms, is carried to the new screens first; each old route then answers 308 to its new address and the old page and its code are deleted.
9. Every old spec that tested those pages (including `m1-14a-timetable-rules`) moves to the new page with the same assertions: none deleted, skipped or weakened.

### Out of scope

Materials; reports; any change to supabase/ or packages/engine (the route is the backend's).
