#!/usr/bin/env bash
# Acceptance proofs for CP-13. Written BEFORE the product code, by a different agent.
# After `athena lock CP-13` this file, spec.md and proofs/ cannot be edited.
# One `check` per "Done when" line, same numbering. Each check must be a real command.
source "$ATHENA_ROOT/.claude/athena/bin/checklib.sh"
cd "$ATHENA_ROOT"

# Every proof uses TEST_DATABASE_URL (a throwaway Postgres in the athena job) or builds its own in a temp folder from
# every migration; never DATABASE_URL. Fake schools, children and staff ids only; every row is rolled back (item 4's
# CLI run commits one fake school and deletes it again). Item 4 never applies the list: it proves listing changes nothing.
PY=packages/engine/.venv/bin/python
P=specs/CP-13/proofs
T="$PY -m pytest -q -p no:cacheprovider --rootdir=$P"

check "1 a mistake absent from a child's recent answers stops marking them repeating" \
  $T $P/test_repeating.py
check "2 two notes by the same adult count as one adult" \
  $T $P/test_one_adult.py
check "3 minimum adults is grade.min_adults: 2 by default, 1 for K2; editing the row moves the result, no code literal" \
  $T $P/test_grade_min.py
check "4 graph_state_changes and engine graph --changes list counts per grade and transition, and change nothing" \
  $T $P/test_changes.py
check "5 blank, wrong and wrong-with-working stay three distinct signals" \
  $T $P/test_three_signals.py
check "6 rebuilt from confirmed evidence only, and the same when rebuilt twice" \
  $T $P/test_rebuild.py

finish
