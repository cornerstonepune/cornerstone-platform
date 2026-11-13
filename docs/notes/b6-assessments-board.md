# B6 — Assessments as a Board (page charter §B6, Part C)

## Verified

- The board, its cards, filters, primary action, panel (Copies · Upload · Check · Results), stat tiles and the retired Upload papers
  page: `apps/web/tests/u87-assessments-board.spec.ts`, one test per charter line
  (`TEST_DATABASE_URL=… npx playwright test tests/u87-assessments-board.spec.ts`).
- Uploading a scan works from an assessment's Upload tab (the old page's server actions and engine calls, moved to
  `app/(app)/children/assessments/upload/`): `tests/u44-upload-on-marking.spec.ts`, `tests/u48-no-guessed-pages.spec.ts`.
- `/capture` answers 308 to `/children/assessments` (`next.config.ts` redirects); the menu has no Upload papers; the guide's
  upload jobs are on the Assessments guide page.
- `bin/check`, `npx tsc --noEmit`, `npx eslint --max-warnings 0 .` pass.

## Handoff

- Data used is only what the lib already read: `assessmentList`, `paperList`, `fileLinks`, `lastScans`, and `across()` for the
  overdue-checks tile (`across.check_overdue_hours`). No engine or schema change.
- A card is compact (topic · class); the panel is titled by the assessment's full built name. The bar's search opens an assessment's
  panel (`open=assessment:<fingerprint>`, `openIdOf` in lib/assessment-ui.ts). The right side is drawn on the Board and Table views;
  the Reading and By topic views have none (they hold no rows of their own to count).
- A stopped reading now still says which pages a person gave to a child (their word stays on the run).
- The assessment's full page (`/children/assessments/[key]`) keeps its own layout; it gained the upload box once printed. It is the
  panel's "Open full page", not yet redrawn as the panel's tabs.
- Retired with the page (feature gone, not moved): Marking's by-class / by-child / by-worksheet tables and its one-sentence count.
  Their specs in s4, u3, u38 were removed or rewritten against the board; goals repointed to the tests that now prove them.
- `packages/engine/engine/checks/live.py` still lists `/capture` in the live menu walk; it answers 308 → board, so it still opens.
