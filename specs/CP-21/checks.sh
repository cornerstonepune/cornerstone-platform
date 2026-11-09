#!/usr/bin/env bash
# Acceptance proofs for CP-21. Written BEFORE the product code, by a different agent.
# After `athena lock CP-21` this file, spec.md and proofs/ cannot be edited.
# One `check` per "Done when" line, same numbering. Each check must be a real command.
source "$ATHENA_ROOT/.claude/athena/bin/checklib.sh"
cd "$ATHENA_ROOT"

# A GitHub run cannot exist before the code, so 1 and 2 prove the behaviour locally (fake data, no database, no browser):
# 1 reads ci.yml, then runs Playwright for real with apps/web's config on a scratch spec of 25 deliberately failing tests
#   (needs apps/web/node_modules: npm ci, which setup.sh runs): with CI set the run must stop early, without CI it must not.
# 2 runs the `browser` and `engine` roll-up steps out of ci.yml with bash, the shard result set to cancelled, failure, success.
# 3 and 4 run .claude/athena/preflight.sh with its guard tests and browser run replaced by stubs (interface in proofs/preflight.py).
P=specs/CP-21/proofs
PY=packages/engine/.venv/bin/python
[ -x "$PY" ] || PY=python3
check "1 browser shards have a time limit and stop early after repeated failures in CI" $PY $P/ci_workflow.py shard-limits
check "2 roll-ups say cancelled for a cancelled shard and failed for a failed one" $PY $P/ci_workflow.py rollup
check "3 preflight.sh runs and fails when a guard test or a listed browser spec fails" python3 $P/preflight.py runs
check "4 preflight prints each page's seconds and fails a page over the 3-second limit" python3 $P/preflight.py page-limit

finish
