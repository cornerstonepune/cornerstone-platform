#!/usr/bin/env bash
# Acceptance proofs for CP-4. Written BEFORE the product code, by a different agent.
# After `athena lock CP-4` this file, spec.md and proofs/ cannot be edited.
# One `check` per "Done when" line, same numbering. Each check must be a real command.
source "$ATHENA_ROOT/.claude/athena/bin/checklib.sh"
cd "$ATHENA_ROOT"

# Database proofs use TEST_DATABASE_URL (CP-20's throwaway Postgres in the athena job) or build their own in a temp
# folder from every migration; never DATABASE_URL. Item 2 alone reads the live database, read-only, on the box.
PY=packages/engine/.venv/bin/python
P=specs/CP-4/proofs
T="$PY -m pytest -q -p no:cacheprovider --rootdir=$P"

check "1 every table listed as child data or school-wide, school-wide with a one-line reason, list covers the database" \
  $T $P/test_list.py
check_box "2 LIVE: no child-data table has a rule that allows everyone (read-only policy count)" \
  $PY $P/live_no_open_rule.py
check "3 per group on every child-data table: own class only, everything sees all, no identity sees none" \
  $T $P/test_groups.py
check "4 a new table with no access_table row fails: apply_conventions() raises naming it, coverage flags it" \
  $T $P/test_unlisted_table.py
check "5 browser and speed tests not deleted, skipped or weakened; the CI test user is in the everything group" \
  $T $P/test_web.py
check "6 engine unaffected: engine_all on every table, engine privileges unchanged, no app_all, views invoker, engine tests not weakened" \
  $T $P/test_engine.py

finish
