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

## Handoff

- Live: nothing yet (this PR is a draft; no merge until the orchestrator says so).
- Next: PR 2 (the tree reads `band = g or g = any(also_bands)`, counts each objective once per grade; objective panel with grades;
  every website action calls `curriculumChanged()` and has a test), then PR 3 (the activity page).
- Blocked: **the engine core is at its budget (230 of 230)**, so the two tests that guard real harm here (a person's edit stands; only a
  coordinator writes) are not in `core.txt`, and the pull request's CI does not run them. Needs the orchestrator to raise the budget by 2
  or name two core tests to retire; the budget is `ENGINE_CORE_MAX` in `tests/test_core_budget.py`.
