#!/usr/bin/env bash
# CP-8 item 6: the existing website pages and the speed tests pass unchanged.
# "Unchanged" is proven here: against where this branch left main, no existing test file of the engine
# (packages/engine/tests) or of the website (apps/web/tests: the page journeys and the speed tests such as
# p6-check-is-quick.spec.ts) is deleted, renamed or has a line removed or rewritten, and the browser suite's
# config (apps/web/playwright.config.ts) is untouched. New lines and new files are allowed (the build adds
# packages/engine/tests/test_plan_link.py).
# "Pass" is ci.yml's own jobs, which every pull request must have green before it merges (the merge rule): the engine
# job runs `uv run pytest -q` in packages/engine (CLAUDE.md, Verify: `cd packages/engine && pytest -q`) and the browser
# job runs `npx playwright test` in apps/web (package.json `test:e2e`). They take far longer than the two minutes these
# proofs may use, so they are not run a second time here (as CP-2, CP-3 and CP-5 do).
set -euo pipefail
cd "$(dirname "$0")/../../.."
base=$(git merge-base HEAD origin/main 2>/dev/null || git merge-base HEAD main) \
  || { echo "no main to compare with: this proof needs the repository's history"; exit 1; }
changed=$(git diff --numstat -M "$base" -- packages/engine/tests apps/web/tests | awk '$2 != "0" { print $3 " (" $2 " lines removed or rewritten)" }')
renamed=$(git diff --name-status -M --diff-filter=DR "$base" -- packages/engine/tests apps/web/tests apps/web/playwright.config.ts)
config=$(git diff --name-only "$base" -- apps/web/playwright.config.ts)
if [ -n "$changed$renamed$config" ]; then
  echo "existing tests changed since main:"; printf '%s\n' "$changed" "$renamed" "$config" | sed '/^$/d'; exit 1
fi
echo "no existing engine or website test (pages or speed) changed since main"
