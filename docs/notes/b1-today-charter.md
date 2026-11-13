# B1 / B1b: Today on the page charter

The two Todays rebuilt to `docs/frontend/page-charter.md` §B1 (educator, Workspace) and §B1b (coordinator, Dashboard), with Part C's
"What needs doing → merge into Today (coordinator)". Frontend only (`apps/web`); no engine or schema change.

## Verified

- Educator: three stat tiles (lessons today · notes to confirm · papers to check), the day's lessons as tinted subject-coloured
  blocks marked done / now / next, the lesson panel (`components/lesson-panel.tsx`, as the timetable opens it) on the right, opened
  on the lesson now or next; a day with no lesson says why and shows the next school day's lessons.
  `npx playwright test tests/u90-today-charter.spec.ts` (B1 lines).
- Coordinator: tiles notes unconfirmed past their time · papers to check · approvals waiting; "Waiting on you", one compact row
  per kind of work (the school's counts and What needs doing's groups, skills aside), one action each, a row opening on the right.
  `tests/u90-today-charter.spec.ts` (B1b lines, Part C).
- The bar's one count is Today's notes tile for both versions (`lib/today-data.ts` `todayBadge`, `lateNotes`).
- Inventory: `SCREEN=today-educator,today-coordinator npx playwright test tests/u70-inventory.spec.ts`, 6 passed.
- `bin/check` passes; `npx tsc --noEmit -p .` and `npx eslint --max-warnings 0 .` in `apps/web` are clean.

## Handoff

- **Blocked on the engine:** the coordinator's "classes in session now" tile. No read gives, across every class, how many have a
  lesson running at the current time (`/k2/today-school` has no such figure; asking `/timetable/day` once per class is 139 calls on
  the copy). Wanted: one count in `/k2/today-school` (or its own read). The tile is not drawn until then; the wireframe marks the gap.
- `/setup/needs-doing` still answers at its address with its filters and the mark-taught form (about twenty specs drive it); its
  kinds of work are Today's rows. Retiring the page and its menu line is a follow-up once those specs move to Today.
- Skills to approve are not counted or listed on Today (specs/UI-7 #3: that count is the eyebrow of Skills to approve only).
