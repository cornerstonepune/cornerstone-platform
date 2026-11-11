# UI-4: assessments, assessment, paper

Branch `ui-4-assessments`, issue #519, PR #566 (draft). Scope: `specs/UI-4/spec.md`.

## State (10 Nov 2026)

Built: `/children/assessments` (tiles, Make, Read, filters, Board | Table), `/children/assessments/[key]` (stepper, approve this
pack, print, the papers bar, what it asks, each child's copy grouped by state, a level choice before print, sign one paper off)
and `.../[key]/[roll]` (the page beside each answer; right, wrong, wrong with working, blank, for you to judge as separate
chips; say what the child wrote, blank, sign this paper off). In the menu as "Assessments board", with its guide page.
`tests/u73-assessments.spec.ts` (7 tests, pass on a local copy) covers Done when 3, 8 to 12 and 14 to 17.

## Decision (orchestrator, 10 Nov 2026): old pages stay live; UI-4b finishes the folds

The old pages carry controls the three screens do not list (the Check queue, change an answer key, name a mistake, add or
remove a question, rename, reader accuracy) and about 45 older specs test them. So this PR redirects nothing: every old
route has a spec, and no spec is changed or dropped. Left for UI-4b: the 308s (Done when 2 and 7), `ux.approveAll` empty (5),
the inventory support and `UI-4` in `merged_slices` (1, 6), the journey `e2e/a-paper-comes-back.spec.ts` (4), "capture:
Photo" on the assessment screen, and the missing controls with each old spec moved as a real test.
`tests/u13-route-walk.spec.ts` lists the two new dynamic routes in `NOT_BY_CLICK` with their reason (they need rows of a class).

## For the orchestrator

- **Name chosen by an educator (#551):** no database change needed. It is already a `change_log` row (table `assessment`,
  op `name`, keyed by the assessment key) read by `chosenNames`; the screen shows `nameOf(chosen, builtName)`.
- **Gap, needs an engine change (outside this lane):** Make "creates at Created" is not possible today. The engine's
  `POST /papers/make` makes and approves in the educator's name in one call, and the maker's button is a button over a
  whole batch (`ux.approveAll` in `workflows.json` lists it). It needs a way to make without approving.
- **Inventory test cannot yet pass a real slice:** `tests/inventory/checks.ts` reports every button that has an `effect` as
  "not yet drivable"; matches controls by `text`/`href`, which `screens.json` does not carry for these elements; does not skip
  links to screens that are not built; and `inventory-fixtures.ts` has no fixture for `[key]` or `[roll]`. Each needs work
  in this slice before `SLICE=UI-4` can pass.

## Decisions

| Choice | Reason |
|---|---|
| Make is a mode of the Assessments screen (`?make=class\|each\|one\|sheet`), the old maker body shown in place of the list. | `/papers/make` folds into this screen; a button that opens the maker keeps the listed buttons and adds no control. |
| `Screen`'s `action` and `next` are optional. | The main action here is one of the screen's own listed controls (marked `data-ux="action"`), and a separate next-step link would be a control outside the list. |

## UI-4b progress (10 Nov 2026, evening)

- **The three screens now pass the inventory test on the paper screen, both roles, 1440** (local copy); the other two pass but for `capture: Photo`, which needs a backend photo route first, so UI-4 stays on the pending list (`merged_slices` unchanged).
- Elements got `text`, `data`, `when` and `drive` hints in `screens.json`; the title of the assessment screen is `{the built name}`; the assessments list has the pager element ("page: Later →", `when: paged`) because the school has more than ten assessments. The wireframes `assessment.html` and `assessments.html` follow (the printed pack is a button; the pager is drawn); `node docs/frontend/wireframes/check.mjs` is clear.
- Fixtures: `tests/inventory-fixtures.ts` `anAssessment` makes a home pack with a copy in every state, two class assessments and nine more, so every screen has rows, a second page, an answer to judge and a copy to sign off. `drive` blocks have `fixture` before and `after` to put the rows back.
- Checker additions (additive): `when` may be a state in the address (`?view=table`) or another address of the screen (`@settled`); `drive.expect.popup`, with a stand-in for the PDF so the engine is not asked to draw a pack for each press.
- A bug in #566 found by the new Make test and fixed: the address arrives percent-encoded. A flaw in my own `u73` fixed: two tests read the table before the streamed page had drawn it.
