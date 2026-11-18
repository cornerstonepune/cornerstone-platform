# CP-70: editable Curriculum (spec: `specs/CP-70/spec.md`, issue #837)

## Verified (PR 1: the migration and the engine door)

- `cd packages/engine && uv run pytest tests/test_curriculum_edit.py -q` against a fresh local database: 8 passed. One test per
  engine Done-when line (1 to 7; line 7 has a second test at the HTTP door).
- `tests/test_layout.py` and `tests/test_core_budget.py`: 13 passed (the map lists `curriculum_edit.py` and its one hand-over to
  `educator_gate`; the core is untouched).
- `ruff check`, `ruff format`, `pyright` clean on the new files. `bin/engine contract` regenerated `apps/web/lib/engine-routes.ts` (8 routes).

## What was found on the way

- The `source` check already allowed `person`, and the loaders already leave any row whose history names a member of staff
  (`seed_activity.by_a_person`), so a reload never overwrites an edit. No loader changed.
- `change_log` already kept `learning_objective` and `activity`, but watched neither `band` nor `subject_code` (the column the tree reads);
  the migration widens both triggers. A link's history row is keyed by its owner's code and watches the other end, so undo reads the
  tie from `before`/`after`, not from `row_id`.
- `activity` has no `source` column, so "made by a person" for an activity is read from its history.

## Handoff (17 Nov, 16:25, from the session that built PR 1 and PR 2)

- **Live / merged:** #864 (PR 1: the migration `20270203090000`, the engine door, history, undo) merged as `9721c95`. The orchestrator confirms
  "migrate live" and the alias. Nothing of it shows on the site yet.
- **In flight:** #870 (PR 2: objective panel Edit tab, the tree reads `also_bands`), base `main`, NOT merged: the orchestrator merges it on
  their word, after #864 is live and #866 has gone. u108 has no `@core` tag (Nimish, 17 Nov: no more core tests; both CP-70 harm guards run nightly).
- **Not started:** PR 3, the activity page (spec Done-when 9). Stack it on #870 (base `cp-70-objective-panel`), no core tests, one small PR.
- **Blocked:** nothing. Ask the orchestrator before retargeting or merging anything.

## For PR 3 (the activity page)

- The engine already has every door it needs (`/curriculum/edit/activity`, `/grade/add|remove`, `/link`, `/unlink`, `/history`, `/undo`; the route list is
  `apps/web/lib/engine-routes.ts`). Only the website is left: the page is `apps/web/app/(app)/setup/activities/[code]/` (it already has an `edit` action
  for the page's parts and `components/activity-page.tsx`); copy the objective panel's pattern (`components/curriculum/objective-edit.tsx`,
  `setup/curriculum/actions.ts`): `requireStaff`, `mustBeOn`, the engine call, `curriculumChanged()`, `revalidatePath`, redirect to `backOf(form)`.
- Show and edit: name, steps, materials, the four rubric levels (`level_0..3`, never blank), the skills and objectives it is tied to (add and
  remove: `activity_skill`, `activity_objective`), and its grades (`activity.also_bands`; the picker offers only the grades the tree shows,
  `curriculumTree()`). The history with a one-step Undo is not on any screen yet: put it on this page.
- A test for each Done-when line in `apps/web/tests/u109-activity-edit.spec.ts`, modelled on u108; each action's `curriculumChanged()` needs a test.

## Gotchas this session paid for

- The tree's panel is `flow.tsx`, not `page.tsx` (`page.tsx` only runs for the appendix and review views).
- A `back` address must match `BACK` in `setup/curriculum/actions.ts`; a unit with a space is `+` in the query, which the pattern now allows.
- What the server keeps (`unstable_cache`) survives between Playwright runs on disk: a test that reads the tree starts with `hook.set({ expire: true })`,
  then `expire: false`, or it reads the last run's tree. `curriculumChanged()` (`updateTag`) does work; do not change it.
- A new check rule needs `engine live rules --write --url <a database built from the migrations>` (rules.json), or `test_rules` fails.
- Local setup: `pg_ctlcluster 16 main start` (the sandbox kills it now and then), a password on the postgres role, `bin/testdb fresh <url>` (~15 min),
  `DATABASE_URL` and `TEST_DATABASE_URL` set in the same command as pytest/playwright. Playwright runs one job at a time (shared ports).
- `u90` can fail locally on `/timetable` and `/children` ("scale gap") from a polluted local database; CI was green.

## PR 3 (17 Nov, evening): the activity page

- **Built:** on `/setup/activities/[code]` a coordinator now edits the name, adds and removes grades (in "Where it sits"), ties and unties
  objectives and skills (in "What the child learns"; an objective is offered from the activity's own grades, a skill from the registry), and
  reads the last five changes in plain words with Undo (a new "Changes" card). A person who only looks gets none of it and sees the grades as
  a line. What the engine refuses comes back as its own sentence at the top of the page (`?said=`).
- **Steps, materials and the four levels keep their older editors** (CP-53's `/curriculum/page/edit` and `/page/materials`), on purpose: they
  keep the steps' list, the materials' items and each part's mark in step, which `/curriculum/edit/activity` does not. Only the name goes
  through `/curriculum/edit/activity`. Their changes are in the same history (the table's trigger) and can be undone from the Changes card.
- **Engine defect found and fixed here:** an undo (or a door edit) of the steps set only the words while the page shows `steps_list` first, so
  nothing changed on screen; it now drops the list so the page reads the words. An undo of the materials' words is refused in a sentence
  when the materials are a list of items (the page shows the items). `history` moved to `w1_bank/curriculum_history.py` (the 400-line
  ceiling); `undo`'s field part is `_put_back` (the complexity limit). Engine test 9 in `test_curriculum_edit.py`.
- **Verified locally:** `tests/u109-activity-edit.spec.ts` 6 passed; u100, u94 (both), m1-09, m1-13c, u73, u108 passed; `test_curriculum_edit`,
  `test_layout`, `test_design_scale`, `test_core_budget`, `test_contract` 34 passed; eslint and impeccable's detector clean. `u90` fails
  locally only on `/children` (the scale gap the handover names; not this page).
- **Not done:** the Apple design skill could not be fetched in this session (the clone was refused by the session's permissions); the
  in-repo `emil-apple-design` skill was used. The objective picker is a plain grouped list (a few hundred lines in a big grade): a search
  box would be better and needs a client component.
- Screenshots: `docs/notes/img/cp-70-activity-1440.png`, `docs/notes/img/cp-70-activity-400.png`.
