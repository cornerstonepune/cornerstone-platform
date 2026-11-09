#!/usr/bin/env bash
# Acceptance proofs for CP-9. Written BEFORE the product code, by a different agent.
# After `athena lock CP-9` this file, spec.md and proofs/ cannot be edited.
# One `check` per "Done when" line, same numbering. Each check must be a real command.
source "$ATHENA_ROOT/.claude/athena/bin/checklib.sh"
cd "$ATHENA_ROOT"

# Database proofs build their own throwaway database (every migration, then the seed) on TEST_DATABASE_URL's server
# or on a Postgres made in a temp folder, one copy per test; DATABASE_URL is removed from the test process and set to
# that copy only. The LIVE proofs (1b, 6b, 7) read DATABASE_URL on the box, read-only, and print counts only.
PY=packages/engine/.venv/bin/python
P=specs/CP-9/proofs
T="$PY -m pytest -q -p no:cacheprovider --rootdir=$P"

check "1 a note confirmed on day D is in the picture after the next morning's nightly run, logged once, scheduled in n8n" \
  $T $P/test_nightly.py
check_box "1b LIVE: an ok nightly run is logged within graph.nightly_stale_hours (read-only)" \
  $PY $P/live_nightly_ran.py
check "2 a correction through the engine is a new row superseding the old; the old row never changes; refused twice" \
  $T $P/test_correct.py
check "3 unplanned counts done sessions with no plan line, is a number, and is not empty when such sessions exist" \
  $T $P/test_unplanned.py
check "4 the picture reads only confirmed evidence; a drafted voice note's evidence is refused" \
  $T $P/test_confirmed_only.py
check "5 blank, wrong and wrong-with-working stay three distinct signals through the nightly run" \
  $T $P/test_signals.py
check "6 two nightly runs leave every evidence record and child state unchanged (throwaway database)" \
  $T $P/test_unchanged.py
check_box "6b LIVE: every logged run left evidence and states unchanged; first run counts equal before and after" \
  $PY $P/live_unchanged.py
check_box "7 LIVE manual gate: 20 real K2 notes confirmed and 5 children's hand calculations all match (counts only)" \
  $PY $P/live_real_notes.py

finish
