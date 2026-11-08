#!/usr/bin/env bash
# Acceptance proofs for CP-7. Written BEFORE the product code, by a different agent.
# After `athena lock CP-7` this file, spec.md and proofs/ cannot be edited.
# One `check` per "Done when" line, same numbering. Each check must be a real command.
# Database proofs run on TEST_DATABASE_URL (`bin/testdb fresh`), in a fake school of their own, academic year 2031-32,
# inside one transaction that is rolled back. They need CP-6, CP-4 and CP-3 and fail saying which until those are on
# main. Item 10 alone reads the live database, read-only, counts only, on the box.
source "$ATHENA_ROOT/.claude/athena/bin/checklib.sh"
cd "$ATHENA_ROOT"

P=specs/CP-7/proofs
T=$P/test_fortnight_plan.py
PY=packages/engine/.venv/bin/python
check "1 a draft has one line per period of each day of weeks A and B on its real date, with who and when" \
  bash $P/pytest.sh $T -k test_1_
check "2 an unchanged fortnight rolls forward with no approval; a removed period approved once is not a change again" \
  bash $P/pytest.sh $T -k test_2_
check "3 a differing or removed line is changed; approving it writes exactly one approval row with who and when" \
  bash $P/pytest.sh $T -k test_3_
check "4 approved only when every changed line is; one action approves all open lines; sent back can be approved later" \
  bash $P/pytest.sh $T -k test_4_
check "5 drafting again with nothing changed writes nothing; after a fix approved lines stay approved" \
  bash $P/pytest.sh $T -k test_5_
check "6 an exception fortnight of its school year rolls nothing forward; default 2026-27 Fortnights 10 and 11" \
  bash $P/pytest.sh $T -k test_6_
check "7 the coordinator or Everything group approves; anyone else is refused by functions or direct writes" \
  bash $P/pytest.sh $T -k test_7_
check "8 the fortnight cannot be marked approved while a class's fortnight is unsettled or stale" \
  bash $P/pytest.sh $P/test_gate.py
check "9 the existing timetable and approval-list suites and the timetable pages are unchanged and pass" \
  bash $P/suites_unchanged.sh
check_box "10 LIVE: both settings rows exist for every school and both new tables exist (read-only counts)" \
  $PY $P/live_settings.py

finish
