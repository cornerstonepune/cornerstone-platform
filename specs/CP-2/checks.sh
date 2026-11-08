#!/usr/bin/env bash
# Acceptance proofs for CP-2. Written BEFORE the product code, by a different agent.
# After `athena lock CP-2` this file, spec.md and proofs/ cannot be edited.
# One `check` per "Done when" line, same numbering. Each check must be a real command.
source "$ATHENA_ROOT/.claude/athena/bin/checklib.sh"
cd "$ATHENA_ROOT"

PY=packages/engine/.venv/bin/python
T=specs/CP-2/proofs/test_static.py

check "1 decision recorded before code, amended with the real-pooler result" \
  $PY -m pytest -q -p no:cacheprovider "$T::test_1_decision_names_chosen_and_rejected_options" \
  "$T::test_1_decision_amended_with_real_pooler_result" "$T::test_1_decision_not_committed_after_the_code"
check "2 public.current_staff() returns the id, nothing when unset, empty or invalid" \
  $PY -m pytest -q -p no:cacheprovider specs/CP-2/proofs/test_current_staff.py
check "3 identity set only in apps/web/lib/db.ts, transaction-local, never from the request" \
  $PY -m pytest -q -p no:cacheprovider "$T::test_3_identity_setting_only_in_db_ts" \
  "$T::test_3_db_ts_sets_identity_transaction_local" "$T::test_3_db_ts_never_reads_the_request"
check_box "4 real pooler: A, B, nobody x200, concurrent, after error and timeout, each sees only its own identity" \
  bash specs/CP-2/proofs/pooler_alternation.sh
check "5 existing browser and speed tests unchanged" \
  $PY -m pytest -q -p no:cacheprovider "$T::test_5_existing_browser_and_speed_tests_unchanged"
check_box "6 no rule switched on: CP-2 adds no policy and no live policy calls current_staff() unexplained" \
  $PY specs/CP-2/proofs/no_rule_switched_on.py

finish
