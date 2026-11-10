#!/usr/bin/env bash
# CP-7 item 8: the existing timetable and approval-list tests and the timetable pages pass unchanged.
# The suites are the ones the design names ("Proofs"): engine test_k2_timetable.py, test_k2_timetable_load.py,
# test_timetable_run_command.py, test_k2_day.py, test_approval_list.py; website journeys m1-09-activity,
# m1-09-calendar, m1-09-materials, m1-14a-timetable-rules.
#   1. Unchanged: against where this branch left main, none of those nine files (nor the browser suite's config) is
#      deleted, renamed or has a line removed or rewritten, except a passage that named a table CP-27 removed (spec
#      CP-27, Done when 18: "except where a test named a removed table directly"; group 3 moved
#      `question_type_approval` into `approval`). Each such passage must name, in what it removes, a table a migration
#      retired or dropped, or write a week label into a `week` column group 5 made a date; any other removed line still
#      fails. Lines added (new tests) are allowed, as before.
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

base=$(git merge-base HEAD origin/main 2>/dev/null || git merge-base HEAD main) \
  || { echo "no main to compare with: this proof needs the repository's history"; exit 1; }
# the tables CP-27 took out of the schema: moved to `retired` or dropped by a migration (a migration of CP-27 group 5
# leaves each one with rows in `retired` and drops each empty one, by a loop over the names it lists as `going`)
removed=$( { grep -hoE "alter table public\.[a-z_]+ set schema retired|^drop table (if exists )?(public\.)?[a-z_]+" \
               supabase/migrations/*.sql | sed -E 's/^alter table public\.([a-z_]+) .*/\1/; s/^drop table (if exists )?(public\.)?//'
             sed -n "/going constant text\[\] := array\[/,/\];/p" supabase/migrations/*.sql | grep -oE "'[a-z_]+'" | tr -d "'"
           } | sort -u | paste -sd'|' -)
for f in "${files[@]}"; do [ -f "$f" ] || { echo "named suite missing: $f"; exit 1; }; done
# each passage (diff hunk) that removes or rewrites lines must name one of them in what it removes
# a passage that wrote a week label into a `week` column CP-27 made a date (group 5: "no table has a text week column")
dated="insert into (prescription|sheet_instance|sheet_template|parent_note|item_exposure|class_card) \\([^)]*week"
changed=$(git diff -U0 -M "$base" -- "${files[@]}" | awk -v gone="(^|[^a-z_])(${removed:-^$})([^a-z_]|$)" -v dated="$dated" '
  function done_hunk() { if (minus > 0 && !named) print file " (" minus " lines removed or rewritten at line " at ")" }
  /^\+\+\+ / { done_hunk(); minus = 0; file = substr($2, 3); next }
  /^--- / { next }
  /^@@/ { done_hunk(); minus = 0; named = 0; split($2, a, ","); at = substr(a[1], 2); next }
  /^-/ { minus++; if ($0 ~ gone || $0 ~ dated) named = 1 }
  END { done_hunk() }')
gone=$(git diff --name-status -M --diff-filter=DR "$base" -- "${files[@]}")
if [ -n "$changed$gone" ]; then
  echo "existing suites changed since main:"; printf '%s\n' "$changed" "$gone" | sed '/^$/d'; exit 1
fi
echo "the nine named suites and the browser config are unchanged since main (but for passages naming a removed table)"

py="${CP7_PYTHON:-$root/packages/engine/.venv/bin/python}"
[ -x "$py" ] || { echo "the engine is not installed ($py missing; cd packages/engine && uv sync --extra dev)"; exit 1; }
[ -n "${TEST_DATABASE_URL:-}" ] || [ -n "$(sed -n 's/^TEST_DATABASE_URL=//p' .env 2>/dev/null)" ] \
  || { echo "no TEST_DATABASE_URL: the engine suites need the local test database (bin/testdb fresh)"; exit 1; }
cd packages/engine
exec "$py" -m pytest -q -p no:cacheprovider "${engine[@]/#/tests/}"
