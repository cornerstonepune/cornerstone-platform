# CP-tests: core tests per pull request, the full suite nightly — handover

Branch `cp-tests-core`. Nimish, 17 Nov 2026: no pull request runs about 3,900 tests again.

## What is built (on the branch)

- **Engine core**: `packages/engine/tests/core.txt` lists node ids or whole files, grouped by the eleven harms in the brief;
  `tests/conftest.py` (`pytest_collection_modifyitems`) marks each `core`; the marker is registered in `pyproject.toml`.
  `pytest -m core` collects 223 tests (91 of them `test_ci_plan.py`, which is being rewritten and may shrink).
- **Browser core**: `{ tag: "@core" }` on 36 tests (titles unchanged, since goal files cite them) (sign-in, password reset, who sees what, timetable rules,
  print and read happy paths, one smoke test per main page). Run with `npx playwright test --grep @core`.
- **Guard**: `tests/test_core_budget.py`: every `core.txt` line names a real test; engine core ≤ 230, browser ≤ 120, both ≤ 350.
- **bin/ci-plan**: drafts and ready pull requests run the same core; docs alone → checks only; seed and notes → the seed
  lane; the website alone → web + browser core; `packages/engine/` alone → engine core; anything else → both cores; a push
  to main or a run by hand → both cores; `--suite full` → everything. The `web-tests` lane is gone (its tests run nightly).
- **ci.yml**: new jobs `engine core` and `browser core` (one runner each, `bin/testdb fresh`); the twelve engine shards and
  five browser shards run only with `suite: full`. The schedule moved out; `workflow_call` takes `suite`.
- **nightly.yml**: 21:00 UTC (02:30 IST), calls ci.yml with `suite: full`, runs `bin/specs`, opens an issue on failure.
  `specs.yml` (proofs on every change) is deleted.
- **Deleted, old look** (standing order 17 Nov): `u70-inventory*.spec.ts` (9), `u14-ui-primitives` and `u71-blocks` with
  their screenshot baselines, `u76-children-wireframe`, `u77-picture-child-wireframe`, `u79-timetable-wireframes`.
- **Docs**: CLAUDE.md Ship step and Rule 14; standing-orders line "Core tests per PR, full suite nightly. (17 Nov)".

## Measured locally (Postgres 16, this container)

- `bin/testdb fresh`: 6 m 44 s (the bank refill). `pytest -m core` on it: 1 m 37 s. Every core test outside `test_ci_plan.py`
  passed. On a schema-only database 214 of 223 pass; the 9 others need the bank (printing, the loop, the graph rule).

## Open

1. `test_ci_plan.py` and the tests that read ci.yml are being rewritten to the new lanes (was a subagent's task; check
   `git status` and run them).
2. Generate `docs/notes/CP-tests-classification.md` (script kept in the session scratchpad; regenerate from
   `pytest --collect-only` and `playwright test --list` counts) and send its totals to the orchestrator
   (session_01KEBF26AbSER2xbWPJjbrmX).
3. PR #815 (redesign) is open. After it merges: rebase, tag `u90-design-system.spec.ts` `@core`, delete any further
   old-look specs it leaves (its handover lists ~25 specs naming the old menu), re-tag smoke tests whose titles it changed.
4. Not done: checking each `bin/specs` proof against newer tests for duplicates; removing the goal runner's code
   (`engine/checks/goal.py`, still wired to `engine goal` and `test_gates.py`) — its tests stay nightly until then.
5. Open the PR (body: deleted files, before/after counts, CI time), mark ready, let CI prove the core plan, run
   `nightly.yml` once by workflow_dispatch on the branch, merge only when green and after #815.
