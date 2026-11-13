# The page charter's last Part C rows (Across classes, What needs doing, an assessment / a child's paper, Parent reports)

Spec: `docs/frontend/page-charter.md` Part A and Part C. Frontend only (`apps/web`, the guide, `workflows.json`, the goals' test names);
no engine or schema change, and only reads the site already had.

## Verified

- **Across classes → Dashboard.** A stat tile per class (what waits on it), one table a class to a row (stage, overdue checks, papers not
  back over the school's days, children needing help in two or more subjects), a class opened on the right with the rows behind each number;
  nothing chosen shows the school's three totals. Reads `across()` only (`lib/across-classes.ts` gathers it by class).
  `tests/u96-across-dashboard.spec.ts`; the old rows' proofs `tests/s43-across-classes.spec.ts` now read the class's panel tabs.
- **What needs doing → Today.** Both Todays carry the old page's work (`app/(app)/today/waiting-work.tsx`): one filter row (Subject, Class,
  What, and the old `kind`), the count of what waits, a row opened on the right as its tasks (ten to a page, each with its action, Mark as
  taught in its row for the class chosen), and "What the system now knows" folded under the list. The educator's Today has the list under her
  day. `/setup/needs-doing` answers 308 to `/today` with its query (`next.config.ts`); its menu line, guide page and map entry are gone, and
  Today has the guide page. `tests/u96-today-needs-doing.spec.ts`; the 34 specs that drove the old page drive Today (`tests/today-work.ts`).
- **An assessment / a child's paper → B6's panel opened full page.** `/children/assessments/[key]` draws the assessment panel inline with
  the board's tabs (Copies · Upload · Check · Results): the pack's acts and where it leads above the tabs, the steps, papers, name and each
  child's copy with its own action on Copies. A child's paper is the same panel, Check open on that paper. `tests/u96-assessment-full-page.spec.ts`.
- **Parent reports → Workspace.** The list on the left (a table per stage), a child's report on the right (Lines with Save words, Approve,
  Send; Report; Approvals); nothing chosen shows what waits and the consent bar. `tests/u96-parent-reports-workspace.spec.ts`; `tests/u74-reports.spec.ts` updated.
- `screens.json` (new screen `across`, in UI-5; today-*, assessment, paper, reports) with the wireframes; `wireframes/check.mjs` all clear;
  `tokens.mjs` and `build-spec.mjs` run. `bin/check`, `npx tsc --noEmit -p .`, `npx eslint --max-warnings 0 .` pass.

## Handoff

- Skills to approve stay off Today (specs/UI-7 #3): the specs that counted skill rows on What needs doing now count them on Skills to approve's eyebrow.
- u49 (one role) no longer compares the old page: Today is two versions by design (UI-7), so it has no like-for-like page to compare.
- The reports board beside the list is gone with the Workspace shape; its lanes were the same reports as the per-stage tables.
- `packages/engine/engine/checks/live.py` and `packages/engine/tests/test_asks.py` still name the old address in a walk or a comment; it answers 308 to Today.
