# UI-6: timetable, fortnight, draft, moves, rules

Branch `ui-6-timetable`, issue #580, PR #581 (draft). Scope: `specs/UI-6/spec.md`.

## State (10 Nov 2026)

Built, on the blocks and the frame, with `tests/u74-timetable.spec.ts` (17 tests, run here against a database built from the
repository: all pass; `m1-14a-timetable-rules` still passes beside it):

- `/timetable` (day / week / fortnight views, this / next fortnight, class for the coordinator; moved cells amber with a fold naming
  who and why; clash cells red for both roles; the Fortnight and Materials cards). The sessions come from `/timetable/week`, so the
  `educator.timetable_enabled` gate behaves exactly as before (switched off: not found).
- `/timetable/fortnight/[n]` (stepper in the school's words, State / Plan lines / Hand moves, Approve for the coordinator only when
  the fortnight is aligned and has not started).
- `/timetable/draft` (Make a draft for every class, tabs per class, the kept draft as a grid, the rules it could not meet).
- `/timetable/moves` (pick a lesson, pick the one to swap with, Why, Move; Undo the last move as a new row; the moves table;
  accept a clash with a reason; read-only for an educator).
- `/timetable/rules` stays the existing page (its spec still passes) with the blocks added: grade and kind filter, the History of
  edits fold (who and when, open), the rail, and Draft as its next step.
- `/api/timetable/[action]`: fortnight / generate / link / move / clash. Each checks the coordinator group first (401 not signed
  in, 403 anyone else) and only then calls the engine, because the engine's plan routes check only the staff list.

## Decisions

| Choice | Reason |
|---|---|
| Fortnight stepper words live in `lib/fortnight-words.ts`, one lookup, each word's source named. Drafted, Frozen, Approved are SPEC's; Aligned and List sent are CP-6's own state names. | Orchestrator, 10 Nov: do not change the data; a SPEC word with no real state is pending, not invented. |
| "Live" is not drawn in the stepper. | No fortnight state means live; going live is a per-class approval and the engine has no route for it. |
| Moves are swaps of two lessons (the engine's `tt_move.move`), picked by two clicks. | The engine moves or swaps; an empty cell cannot be a target in the grid block. |
| Rules page keeps its in-place forms rather than an Edit button per row. | `m1-14a-timetable-rules` tests the forms; rewriting that spec to match a new look is a decision for the orchestrator. |
| Subject colours: NUM numeracy; ENG, HIN, MAR, SAN language; the rest arts (`lib/timetable-ui.ts`). | Presentation grouping only; the subject table has no group column. A row in the database would be better (rule 1). |
| The new specs use a class, grade (K1) and year (2033-34) of their own. | The school's own K2 timetable load (m1-14a) refuses to run over fortnights it did not make. |
| Cells link to `/educator/period/[id]` and `/educator/activity/[code]` until UI-3 builds `/period/[id]` and `/setup/activities/[code]`. | A rail or card link to a screen that is not built is not drawn (lib/built.ts), so no link is dead. |

## Held: split to UI-6b (#586), decided by the orchestrator, 10 Nov

- **Go live** and the **what-changed table** (Done when 4, 15 of the spec's fortnight lines): the engine has no route for going live
  and the report is never stored. Reported to the orchestrator and the backend.
- **The journey** `e2e/the-coordinators-fortnight.spec.ts` (Done when 5) needs Go live; the steps up to Approve are covered by
  `u74-timetable.spec.ts`.
- **Inventory** (Done when 1, 6): `UI-6` is not added to `merged_slices` until the inventory checker can drive these screens (the same
  state as UI-4: `drive` hints wait for #578 and the `[n]` fixture lives in `tests/inventory-fixtures.ts`, which this lane does not edit).
- Day view by default at 400 px; the Edit-this-row flow on the rules page; the rules' grade filter is a class picker.
