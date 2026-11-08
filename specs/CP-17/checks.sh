#!/usr/bin/env bash
# Acceptance proofs for CP-17. Written BEFORE the product code, by a different agent.
# After `athena lock CP-17` this file, spec.md and proofs/ cannot be edited.
# One `check` per "Done when" line, same numbering. Each check must be a real command.
# Database proofs run on TEST_DATABASE_URL (the local copy `bin/testdb fresh` builds), each in a transaction that is
# rolled back, on fake items, classes and staff ids in a 2037-38 school year; item 4's two-people proof commits its fake
# rows and removes them. Items 5 and 6 need CP-6 (fortnight_cycle) and item 7 needs CP-4 (access_table.data_class): they
# fail saying so until those are merged. Item 8 alone reads the live database, read-only, counts only, on the box.
source "$ATHENA_ROOT/.claude/athena/bin/checklib.sh"
cd "$ATHENA_ROOT"

P=specs/CP-17/proofs
PY=packages/engine/.venv/bin/python
check "1 each school has a rupee threshold; tracked when a value is entered and at or above it; the setting moves it" \
  bash $P/pytest.sh $P/test_threshold.py
check "2 engine and website use the one rule; the old any-price rule is gone" \
  bash $P/pytest.sh $P/test_tracked_rule.py
check "3 any item can have received, issued, returned, counted, written-off records; on hand from them; append-only" \
  bash $P/pytest.sh $P/test_stock_records.py
check "4 refused: untracked stock when limited, more than on hand (also two at once), no reason, role not allowed" \
  bash $P/pytest.sh $P/test_refusals.py
check "5 a fortnight list is approved only by its educator or a coordinator, after the freeze, on the lines shown" \
  bash $P/pytest.sh $P/test_approval.py
check "6 a changed list is no longer approved; no send of a fortnight list without a current approval; day and week as today" \
  bash $P/pytest.sh $P/test_send_needs_approval.py
check "7 every new table has its access rule; the existing materials tests still pass" \
  bash $P/item7.sh
check_box "8 LIVE: every school has the four new settings and nothing is below zero (read-only counts)" \
  $PY $P/live_inventory.py

finish
