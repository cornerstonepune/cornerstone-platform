#!/usr/bin/env bash
# Acceptance proofs for CP-14. Written BEFORE the product code, by a different agent.
# After `athena lock CP-14` this file, spec.md and proofs/ cannot be edited.
# One `check` per "Done when" line, same numbering. Each check must be a real command.
source "$ATHENA_ROOT/.claude/athena/bin/checklib.sh"
cd "$ATHENA_ROOT"

# Items 1-6 use TEST_DATABASE_URL (a throwaway Postgres in the athena job) or build their own in a temp folder from
# every migration (CP-20); never DATABASE_URL. Fake schools, skills, staff (.invalid emails) and children by Sr. No.;
# every row is rolled back (item 1's CLI run commits one fake school and deletes it again). None needs CP-4.
# Item 7 is LIVE: a read-only count on the box through `engine links check --k2`, counts only.
PY=packages/engine/.venv/bin/python
P=specs/CP-14/proofs
T="$PY -m pytest -q -p no:cacheprovider --rootdir=$P"

check "1 a reviewed list is confirmed by pairs in one step, naming the person; a wrong pair confirms nothing and names its line" \
  $T $P/test_confirm_list.py
check "2 a proposed or confirmed link is withdrawn with a reason and stops counting for ready next at once; a blank reason is refused" \
  $T $P/test_withdraw.py
check "3 every confirmation and withdrawal is kept in the edit history with who and when, never erased" \
  $T $P/test_history.py
check "4 only coordinators and educators decide, the loader cannot confirm, and the roles are a settings row" \
  $T $P/test_who_decides.py
check "5 the child page lists its grade's ready activities with the ready skills that make them so (hand-worked table)" \
  $T $P/test_ready_activities.py
check "6 ready next per skill answers as before, and the child page's reads are the same for a small and a large class" \
  $T $P/test_same_answers.py
check_box "7 LIVE: K2 activity-skill links are loaded (more than zero) and none is left proposed" \
  $PY $P/live_k2_links.py

finish
