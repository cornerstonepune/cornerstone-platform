# UI-3c: the teaching pages (activity, objective, skill)

Branch `ui-3c-teaching-pages`, part of #518 (UI-3a #571 and UI-3b #570 were not merged when this was written). Scope: `specs/UI-3c/spec.md`.
Tests: `apps/web/tests/u73-teaching-pages.spec.ts` (one per Done-when line that a browser can check now).

## State (10 Nov 2026)

Three screens at `/setup/activities/[code]`, `/setup/objectives/[code]`, `/setup/skills/[code]`, reading rows directly (`lib/teaching.ts`).
`/educator/activity/[code]` and `/curriculum/fill/[code]` answer 308 to the first. `/curriculum/fill/walk` (the drafts queue) and
`/skill-sets/[code]` (grades 1 to 4: worksheets, bank, approval, editing) are not moved: folding them would delete features.
15 of 15 U73 tests pass locally on a database built from the repository's migrations and seed (no question bank or library).

## Choices

| Choice | Reason |
|---|---|
| The educator switch (`educator.timetable_enabled`) is still asked (`openTo`) on all three pages. | The old activity page asked it and `m1-09-activity` locks it; UI-3b dropped it for its pages. Flagged to the orchestrator: one of the two is wrong. |
| An activity's parts are read from rows (`activityPage`), not the engine's `/curriculum/page/read`. Keep, Edit and Send back still go through the engine. | The engine read repeats the switch's gate and adds nothing. |
| `lib/built.ts` treats the screens named in `SCREEN=` as built. | A pull request's run covers screens that link to each other (activity, objective, skill) before their slice is in `merged_slices`; unset in production. |
| A skill's code is the `registry_skill` code. | `child_skill_state`, `learning_objective_skill`, `activity_skill` and `skill_link_confirmed` all use it. |
| The spark is always empty. | The nightly run records no class counts yet. |

## Not done, and why

- **Inventory run `SCREEN=activity,objective,skill` fails.** What is left: elements need `text`/`data` fields in screens.json so the
  checker matches "each objective", "each activity row", "rail: each skill"; titles need the `{…}` form; the checker has no driver for the
  effects of Keep, Edit, Send back and "Change a level's sentence"; the skill screen took 3 minutes to time out at 1440 (not yet found).
- **Missing on main (asked of the orchestrator):** a store for an activity's photo; `skill_level_version`; the cluster computation.
- **ChildPeek on the skill screen** waits for `/api/children/peek` (UI-3b #570).
- Kinds of question and mistakes folds on the skill screen (grades 1 to 4 data keyed by `skill.code`).
