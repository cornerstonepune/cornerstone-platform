#!/usr/bin/env bash
# CP-7 item 9: the existing timetable and approval-list tests and the timetable pages pass unchanged.
# The suites are the ones the design names ("Proofs"): engine test_k2_timetable.py, test_k2_timetable_load.py,
# test_timetable_run_command.py, test_k2_day.py, test_approval_list.py; website journeys m1-09-activity,
# m1-09-calendar, m1-09-materials, m1-14a-timetable-rules.
#   1. Unchanged: against where this branch left main, none of those nine files (nor the browser suite's config) is
#      deleted, renamed or has a line removed or rewritten.
#   2. Pass: the five engine suites are run here, on the local test database (TEST_DATABASE_URL).
#      The four journeys need a production build of the website (over five minutes, past the two minutes these proofs
#      may use), so their pass is ci.yml's browser job, which the merge rule needs green; they are not run twice here.
set -uo pipefail
root=$(cd "$(dirname "$0")/../../.." && pwd)
cd "$root"
engine=(test_k2_timetable.py test_k2_timetable_load.py test_timetable_run_command.py test_k2_day.py test_approval_list.py)
pages=(m1-09-activity m1-09-calendar m1-09-materials m1-14a-timetable-rules)
files=(apps/web/playwright.config.ts)
for f in "${engine[@]}"; do files+=("packages/engine/tests/$f"); done
for p in "${pages[@]}"; do files+=("apps/web/tests/$p.spec.ts"); done

for f in "${files[@]}"; do [ -f "$f" ] || { echo "named suite missing: $f"; exit 1; }; done
base=$(git merge-base HEAD origin/main 2>/dev/null || git merge-base HEAD main) \
  || { echo "no main to compare with: this proof needs the repository's history"; exit 1; }
changed=$(git diff --numstat -M "$base" -- "${files[@]}" | awk '$2 != "0" { print $3 " (" $2 " lines removed or rewritten)" }')
gone=$(git diff --name-status -M --diff-filter=DR "$base" -- "${files[@]}")
if [ -n "$changed$gone" ]; then
  echo "existing suites changed since main:"; printf '%s\n' "$changed" "$gone" | sed '/^$/d'; exit 1
fi
echo "the nine named suites and the browser config are unchanged since main"

py="${CP7_PYTHON:-$root/packages/engine/.venv/bin/python}"
[ -x "$py" ] || { echo "the engine is not installed ($py missing; cd packages/engine && uv sync --extra dev)"; exit 1; }
[ -n "${TEST_DATABASE_URL:-}" ] || [ -n "$(sed -n 's/^TEST_DATABASE_URL=//p' .env 2>/dev/null)" ] \
  || { echo "no TEST_DATABASE_URL: the engine suites need the local test database (bin/testdb fresh)"; exit 1; }
cd packages/engine
exec "$py" -m pytest -q -p no:cacheprovider "${engine[@]/#/tests/}"
