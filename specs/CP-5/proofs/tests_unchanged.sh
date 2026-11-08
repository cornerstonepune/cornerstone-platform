#!/usr/bin/env bash
# CP-5 item 5, first half: the engine's tests and the website's tests are unchanged on this branch. Against where it
# left main, no existing test file under packages/engine/tests or apps/web/tests is deleted and no line in one is
# removed or rewritten; new lines and new files are allowed (the search-path guard extends test_db_privileges.py).
set -euo pipefail
base=$(git merge-base HEAD origin/main 2>/dev/null || git merge-base HEAD main)
changed=$(git diff --numstat "$base" -- packages/engine/tests apps/web/tests | awk '$2 != "0" { print $3 " (" $2 " lines removed or rewritten)" }')
if [ -n "$changed" ]; then
  echo "existing tests changed since main:"; echo "$changed"; exit 1
fi
echo "no existing engine or web test changed since main"
