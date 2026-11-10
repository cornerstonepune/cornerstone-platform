# UI-4: assessments, assessment, paper

Branch `ui-4-assessments`, issue #519, PR #566 (draft). Scope: `specs/UI-4/spec.md`.

## State (10 Nov 2026): first increment only

Built: `/children/assessments` (tiles, Make, Read, filters, Board | Table) on the 28 blocks and the existing queries.
Not built: the assessment screen, the paper screen, the 308 redirects, the Done-when tests, the journey, inventory support.
Verified: `tsc` and `eslint` on the changed files. Not run: the browser, the inventory test (a local test database was built,
no browser run yet).

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
