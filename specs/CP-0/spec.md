# CP-0: The backend plan and the CP prefix

Source: https://github.com/cornerstonepune/cornerstone-platform/issues/450 (locked by Nimish, 8 Nov 2026)

## What

Makes the 19-scope backend plan the one official list of what remains for the K2 backend, and makes `CP` the spec prefix so scope numbers run CP-1 onward. The plan holds no status; status comes from the harness.

## Done when

1. `.claude/athena/config.json` has `id_prefix` equal to `CP`, and `athena next-id` run on a checkout with no spec folders prints `CP-1`.
2. `docs/backend-plan.md` lists exactly the scopes CP-1 to CP-19, and every one of them has a GitHub issue whose title starts with that ID. (Test: compare the plan's table to the issue titles.)
3. `docs/backend-plan.md` contains no status words (done, merged, in progress, blocked) in its table. (Test.)
4. `docs/HANDOFF.md` points to `docs/backend-plan.md` as the list of what remains and is under 50 lines.
5. The fast checks pass.

## Out of scope

Building any CP scope. Changing the Athena harness itself. Any change to the old goal-loop history.
