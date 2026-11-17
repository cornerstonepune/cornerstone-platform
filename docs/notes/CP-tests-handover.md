# CP-tests: core tests per pull request, the full suite nightly — handover

Branch `cp-tests-core`. Nimish, 17 Nov 2026: no pull request runs about 3,900 tests again.

## What is built (on the branch)

- **Engine core**: `packages/engine/tests/core.txt` lists node ids or whole files, grouped by the eleven harms in the brief;
  `tests/conftest.py` (`pytest_collection_modifyitems`) marks each `core`; the marker is registered in `pyproject.toml`.
  `pytest -m core` collects 209 tests.
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

- `bin/testdb fresh`: 6 m 44 s (the bank refill). `pytest -m core` on it: 209 passed in 1 m 47 s. Totals
  (docs/notes/CP-tests-classification.md): core 245 (209 engine, 36 browser), nightly 5,492, deleted 98 (14 browser specs).

## Open

1. Done: `test_ci_plan.py` rewritten to the new lanes; `bin/ci-plan` crash on a web+engine change fixed; classification
   committed. Comments in a few surviving specs still mention u70-inventory; `inventory-fixtures.ts` may have unused exports.
2. The core run on CI has to prove the < 10 minute wall time; locally the database build alone is 6 m 44 s.
3. PR #815 (redesign) is open. After it merges: rebase, tag `u90-design-system.spec.ts` `@core`, delete any further
   old-look specs it leaves (its handover lists ~25 specs naming the old menu), re-tag smoke tests whose titles it changed.
4. Not done: checking each `bin/specs` proof against newer tests for duplicates; removing the goal runner's code
   (`engine/checks/goal.py`, still wired to `engine goal` and `test_gates.py`) — its tests stay nightly until then.
5. Open the PR (body: deleted files, before/after counts, CI time), mark ready, let CI prove the core plan, run
   `nightly.yml` once by workflow_dispatch on the branch, merge only when green and after #815.

## State at handover (17 Nov)

- Draft PR #822 is open from `cp-tests-core`; this session is subscribed to it. Totals were sent to the orchestrator.
- Next steps, in order:
  1. Watch #822's CI. A draft now runs the core, which is the first proof of the plan. Confirm the engine core and
     browser core each finish in under 10 minutes.
  2. Once #815 merges: rebase onto main and resolve the `@core` tags in specs #815 changed. Tag
     `u90-design-system.spec.ts` with `{ tag: "@core" }`. Delete any further old-look specs, then regenerate the
     classification.
  3. Mark #822 ready and let CI go green on that head.
  4. Dispatch `nightly.yml` on `cp-tests-core`. GitHub may refuse to dispatch a workflow that is not yet on the default
     branch; if so, say so and run it once after the merge instead.
  5. Merge when every check is green, then report to the orchestrator with send_message.

## Added by the orchestrator (17 Nov, 08:14 UTC). Do these in this PR, before merging.

6. **Cache the built test database in CI.** Key it on a hash of `supabase/migrations/**` and `supabase/seed/**` (and
   `bin/testdb`): `actions/cache` of a `pg_dump -Fc` made after `bin/testdb fresh`; on a hit, `pg_restore` it instead of
   rebuilding. Use it in `engine core`, `browser core` and the nightly shards. Measure a cache hit and a cache miss, and
   put both times in #822's body. Note: a hit skips rebuilding from every migration, so a cache miss, or the nightly with
   no cache, is what proves migrations apply cleanly in order. Say that in the job comment and keep the nightly cache-free.
7. **Remove the goal runner** (retired 2026-11-07):
   - Delete `engine/checks/goal.py` and its wiring: `cli_check.py` (`goal` command, `goal_module` import) and
     `engine/checks/done.py`.
   - Delete `tests/test_goal.py`; fix `tests/test_gates.py`.
   - Update `workflows.json` (the file lists and any `engine goal` command) and `test_layout.py`, so the map stays true.
   - `bin/check` and `test_promises.py` read `goals/*.yaml` for promises, not the runner. Check they still pass.
   - If removing it turns out to be big or risky, stop and tell the orchestrator rather than half-doing it.
8. Leave the proofs nightly; checking each one for duplicates is not needed.

CI: the red `engine` and `browser` on 6b749c2 came from a run cancelled by the next push (the roll-ups report a cancelled
run as failed). Read the run on the current head.
