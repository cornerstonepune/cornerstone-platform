#!/usr/bin/env bash
# Acceptance proofs for CP-21. Written BEFORE the product code, by a different agent.
# After `athena lock CP-21` this file, spec.md and proofs/ cannot be edited.
# One `check` per "Done when" line, same numbering. Each check must be a real command.
source "$ATHENA_ROOT/.claude/athena/bin/checklib.sh"
cd "$ATHENA_ROOT"

# Every database proof uses TEST_DATABASE_URL (CP-20's throwaway Postgres in the athena job) or builds its own in a
# temp folder from every migration; never DATABASE_URL. A fake school, one K2 class in fortnights of January 2031,
# placeholder staff; every row is rolled back. The engine commands (`timetable go-live`, CP-11's `timetable generate`,
# `timetable load`) run in-process on the proof's own transaction (proofs/conftest.py).
# Needs, from scopes not on main yet: CP-11 (timetable_run, `engine timetable generate`, FET), CP-6 (fortnight_cycle),
# CP-3/CP-4 (role groups, access_table); each proof says which one is missing when it is.
PY=packages/engine/.venv/bin/python
P=specs/CP-21/proofs
T="$PY -m pytest -q -p no:cacheprovider --rootdir=$P"

check "1 a placed draft live: every date shows exactly the draft; fortnights before and after unchanged" \
  $T $P/test_1_draft_shown.py
check "2 a 15-day fortnight is live on every date, the repeated Monday too; a holiday has no lessons" \
  $T $P/test_2_fifteen_days.py
check "3 planned lessons keep plan and materials lines, dates follow; pinned lessons stay; stop cases list and write nothing" \
  $T $P/test_3_sessions_follow.py
check "4 stale rules, unplaced draft, started fortnight, date with no school day refused with reason; other drafts stay current" \
  $T $P/test_4_refusals.py
check "5 only the go-live group (a setting) goes live; the record keeps who, when, which draft and cannot change" \
  $T $P/test_5_who.py
check "6 a fortnight changed by hand since going live is refused unless discarded; the discard keeps who" \
  $T $P/test_6_changed_since.py
check "7 a frozen fortnight goes live only with a reason, and the reason is kept" \
  $T $P/test_7_frozen.py
# 8: the trial run and the loader's refusal (tests), then the existing engine and web tests unchanged (CP-5's pattern;
# that they pass is ci.yml's engine and web jobs), then the LIVE trial run on the box.
check "8 trial run shows each date and writes nothing; the loader refuses a live fortnight; existing tests unchanged" \
  bash -c "$T $P/test_8_trial_and_loader.py && bash $P/tests_unchanged.sh && bash $P/tests_unchanged.sh --self-check"
check_box "8 LIVE: trial run for K2's next teaching fortnight prints counts and changes nothing (read-only)" \
  $PY $P/live_trial_run.py

finish
