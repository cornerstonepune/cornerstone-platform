# UI-4: assessments, assessment, paper

Branch `ui-4-assessments`, issue #519, PR #566 (draft). Scope: `specs/UI-4/spec.md`.

## State (10 Nov 2026)

Built: `/children/assessments` (tiles, Make, Read, filters, Board | Table), `/children/assessments/[key]` (stepper, approve this
pack, print, the papers bar, what it asks, each child's copy grouped by state, a level choice before print, sign one paper off)
and `.../[key]/[roll]` (the page beside each answer; right, wrong, wrong with working, blank, for you to judge as separate
chips; say what the child wrote, blank, sign this paper off). The old pages answer 308 (config for `/papers`, `/papers/make`,
`/capture`, `/capture/check`; route handlers for the ones that name a paper or assessment). Menu, guide and `workflows.json`
follow. `tests/u73-assessments.spec.ts` (8 tests, all pass on a local copy) covers Done when 2, 3, 7 to 12, 14 to 17.
Not built: the inventory support (`SLICE=UI-4`), the journey `e2e/a-paper-comes-back.spec.ts` (Done when 4), "capture: Photo"
on the assessment screen, `UI-4` in `merged_slices`.

## Held back: the folds remove features and about 45 older specs

The pages that fold carried things the three screens do not list: the one-answer-at-a-time Check queue, changing a question's
answer key, naming a mistake, adding or removing a question on a paper (`/papers/review`), renaming an assessment, the reader
accuracy view, "files read lately". Their server actions remain in the code but nothing opens them. Roughly 45 older specs
open `/papers` or `/capture` (u9, u16, u22, u37, u63, s4, s26, p5, p6 and others). Migrating them would be rewriting them to
other behaviour, and deleting them loosens the checks, so this PR is not mergeable until the orchestrator chooses: keep those
pages alive, drop the features and specs, or add the controls to the screens.

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
