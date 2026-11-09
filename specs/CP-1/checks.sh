#!/usr/bin/env bash
# Acceptance proofs for CP-1. Written BEFORE the product code, by a different agent.
# After `athena lock CP-1` this file, spec.md and proofs/ cannot be edited.
# One `check` per "Done when" line, same numbering. Each check must be a real command.
source "$ATHENA_ROOT/.claude/athena/bin/checklib.sh"
cd "$ATHENA_ROOT"

P=specs/CP-1/proofs
check_box "1 staff count equals sign-in list and every staff row has an open grant" bash $P/box_staff_count.sh
check "2 staff load leaves the sign-in list unchanged (before/after hash)" bash $P/pytest.sh $P/test_signin_list.py
check "3 a move closes the open enrolment and opens one, never two open, refusal changes nothing" bash $P/pytest.sh $P/test_move_enrolment.py
check_box "4 K2-A 2026-27 open enrolment rolls are exactly 1 to 22" bash $P/box_k2a_rolls.sh
check "5 adding an activity and adding, changing or removing a link write edit history with who and when" bash $P/pytest.sh $P/test_edit_history.py
check "6 new tables have a named owner and no staff name lands outside pii" sh -c "python3 $P/new_tables_owned.py && bash $P/pytest.sh $P/test_no_staff_name.py"

finish
