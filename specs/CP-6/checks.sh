#!/usr/bin/env bash
# Acceptance proofs for CP-6. Written BEFORE the product code, by a different agent.
# After `athena lock CP-6` this file, spec.md and proofs/ cannot be edited.
# One `check` per "Done when" line, same numbering. Each check must be a real command.
# Lean design (design.md): the engine (packages/engine/engine/w2_print/fortnight_cycle.py) enforces the cycle; there are
# no database triggers and no SQL functions. Database proofs run on TEST_DATABASE_URL, rolled back; item 7 alone reads
# the live database, read-only, on the box.
source "$ATHENA_ROOT/.claude/athena/bin/checklib.sh"
cd "$ATHENA_ROOT"

P=specs/CP-6/proofs
PY=packages/engine/.venv/bin/python
check "1 a fortnight has one state from the list, who and when recorded for every step, tables listed school-wide" \
  bash $P/pytest.sh "$P/test_state.py" -k test_1_
check "2 step dates are per-school settings, a holiday or weekend moves to the working day before" \
  bash $P/pytest.sh $P/test_dates.py
check "3 a frozen fortnight's timetable or plan lines change through the engine only with a reason, which is recorded" \
  bash $P/pytest.sh $P/test_freeze.py
check "4 a step cannot be skipped or undone: approving a fortnight never frozen is refused" \
  bash $P/pytest.sh "$P/test_state.py" -k test_4_
check "5 each fortnight state change writes one edit-history row with who and when" \
  bash $P/pytest.sh $P/test_history.py
check "6 no hard-coded frozen in engine or website; day, week and period read it from the fortnight's state" \
  bash $P/pytest.sh $P/test_no_hardcode.py
check_box "7 LIVE: the current fortnight has a state row and the step settings exist (read-only counts)" \
  $PY $P/live_fortnight.py

finish
