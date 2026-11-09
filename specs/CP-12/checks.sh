#!/usr/bin/env bash
# Acceptance proofs for CP-12. Written BEFORE the product code, by a different agent.
# After `athena lock CP-12` this file, spec.md and proofs/ cannot be edited.
# One `check` per "Done when" line, same numbering. Each check must be a real command.
source "$ATHENA_ROOT/.claude/athena/bin/checklib.sh"
cd "$ATHENA_ROOT"

# Every database proof uses TEST_DATABASE_URL (CP-20's throwaway Postgres in the athena job) or builds its own in a
# temp folder from every migration; never DATABASE_URL. A fake school, one K2 class in fortnights of January 2031 (or
# around today, for the past-day refusal), placeholder @example.org staff; every row is rolled back. The engine
# commands (`timetable move|accept|clashes`, with --by EMAIL) run in-process on the proof's own transaction
# (proofs/conftest.py). Needs, from scopes not on main yet: CP-6 (fortnight_cycle, its freeze), CP-21 (the dated
# layer), CP-4 (access_table); each proof says which one is missing when it is.
PY=packages/engine/.venv/bin/python
P=specs/CP-12/proofs
T="$PY -m pytest -q -p no:cacheprovider --rootdir=$P"

check "1 a lesson moves or swaps; each move kept with who, when, from, to, why; history cannot change" \
  $T $P/test_1_move_kept.py
check "2 a move changes only its own fortnight, a 15-day one too; neighbours and the frame unchanged" \
  $T $P/test_2_one_fortnight.py
check "3 the day shows the moved lesson with plan and materials lines; fixed, past, holiday, marked refused with why" \
  $T $P/test_3_day_and_refusals.py
check "4 clashes listed per kind with fortnight, week and lessons; moving back removes the clash" \
  $T $P/test_4_clashes.py
check "5 a clash accepted with reason, who, when; reopened when its lesson moves or its limit changes" \
  $T $P/test_5_accept.py
check "6 an open clash blocks approval and a clash-making move in an approved fortnight; a setting, on by default" \
  $T $P/test_6_approval.py
check "7 a frozen fortnight refuses a move without a reason and keeps one with a reason" \
  $T $P/test_7_frozen.py
# 8: role rules on the two tables (throwaway database), then the existing engine and web tests unchanged (CP-5's
# pattern; that they pass is ci.yml's engine and web jobs), then the LIVE counts on the box.
check "8 move history and clash acceptance have role rules on; existing tests unchanged" \
  bash -c "$T $P/test_8_role_rules.py && bash $P/tests_unchanged.sh && bash $P/tests_unchanged.sh --self-check"
check_box "8 LIVE: move history and acceptance have role rules on; clash count per fortnight printed (read-only)" \
  $PY $P/live_clashes.py

finish
