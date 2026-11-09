#!/usr/bin/env bash
# Acceptance proofs for CP-11. Written BEFORE the product code, by a different agent.
# After `athena lock CP-11` this file, spec.md and proofs/ cannot be edited.
# One `check` per "Done when" line, same numbering. Each check must be a real command.
# Database proofs run on TEST_DATABASE_URL only: a made-up grade ZP class with 2031 fortnights, fake rules, no names;
# `bin/engine timetable generate` is a second process, so each module commits its rows and deletes them again.
# FET proofs run the real `fet-cl` (Debian's `fet`, 6.8.5 when written); where it is missing they FAIL with that reason.
# Item 1 is box only as a whole: its image and CI parts are asserted inside the same box script, so the line stays one
# check (the CI side is also exercised by items 2 to 5, which cannot pass without fet-cl). Item 6 reads the live
# database read-only and runs the command with --dry inside the engine container.
source "$ATHENA_ROOT/.claude/athena/bin/checklib.sh"
cd "$ATHENA_ROOT"

P=specs/CP-11/proofs
PY=packages/engine/.venv/bin/python
check_box "1 FET in the deployed image: build fails without it, CI prints its version, the running engine prints it" \
  bash $P/box_fet_version.sh
check "2 generate places every needed lesson on free periods within the rules and keeps FET's exact input and output" \
  bash $P/pytest.sh $P/test_generate.py
check "3 unmet rules report placed against needed and name the rule; a timeout says no timetable found in time; nothing written" \
  bash $P/pytest.sh $P/test_unmeetable.py
check "4 the same rules twice give the same input file and the same draft" \
  bash $P/pytest.sh $P/test_same_twice.py
check "5 a 15-day fortnight drafted day by day, a holiday empty, a kept draft cannot be changed or deleted" \
  bash $P/pytest.sh $P/test_long_fortnight.py
check_box "6 LIVE: a dry run for K2's current or next fortnight places every needed lesson and writes nothing" \
  $PY $P/live_dry_run.py

finish
