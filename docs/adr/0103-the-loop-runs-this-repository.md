# 0103: The loop runs this repository

Date: 2026-11-23. Status: accepted (Nimish asked for `/loop:init` on this repository).
Goal: none — the goal loop is retired; this is the setup of the loop itself.

## What changed
Work here now goes through the loop plugin (`.loop.json`, `PROJECT.md`, `HANDOFF.md`, `LESSONS.md`, GitHub tickets,
builder and reviewer subagents, the `loop-guard` and `loop-tests` checks). It replaces the spec-driven process the old
`CLAUDE.md` described (a `CP-<n>` issue, `specs/CP-<n>/spec.md`, the `to-spec` and `writing-plans` skills) and every
earlier agent setup still in the tree (the Athena installer's reference file, graft and canny configs, 34 project skills).

## Decision
- `CLAUDE.md` is the loop's template. The still-true facts about this product (stack, the workflow map, the data rules,
  the school's words) are kept in its "Project specifics" section. Everything else from the old file is in git history.
- `PROJECT.md` is added from the template and filled by adoption (`loop-adopt`), which reads `ARCHITECTURE.md`, `SPEC.md`
  and `docs/sources/assessment-workflow-v1.md`. Those documents are not changed; the workflow still wins where they disagree.
- `loop-tests` runs the engine's `core` tests against a database built from this repository alone (`bin/testdb fresh`),
  the same set and database `ci.yml`'s engine core job uses. `ci.yml`, `nightly.yml` and the deploy workflows are unchanged.
- The `impeccable` project skill is kept: the global rules name it as the frontend review skill and nothing else installs it.

## Rejected
- Running the whole engine suite in `loop-tests`: Nimish ruled on 2026-11-17 that no pull request runs the whole suite.
- Whole-engine `pyright` as the typecheck: 2,237 errors are frozen debt. `tests/test_types.py` already holds pyright to
  the per-file allowances in `workflows.json`, so it is the typecheck command.

## Note
Code comments and workflows that cite "CLAUDE.md rule N" or "Rule 14" mean the pre-loop file:
`git show 8924680f:CLAUDE.md`. The rules about data they cite are kept in "Project specifics".
