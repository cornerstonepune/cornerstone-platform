#!/usr/bin/env bash
# Acceptance proofs for CP-10. Written BEFORE the product code, by a different agent.
# After `athena lock CP-10` this file, spec.md and proofs/ cannot be edited.
# One `check` per "Done when" line, same numbering. Each check must be a real command.
source "$ATHENA_ROOT/.claude/athena/bin/checklib.sh"
cd "$ATHENA_ROOT"

# Database proofs run on TEST_DATABASE_URL's server (GitHub's proofs job) or, without it, on a Postgres made in a temp
# folder (initdb); never on DATABASE_URL. Each test copies a base built from every migration into a database of its own
# and drops it after, so the engine's routes and commands may commit. Fake school, made-up names, a made-up transcript
# and fake audio bytes in a temp folder; the speech service is a fake in-process transport. The clean-up is reached as
# the schedule reaches it (POST /voice/cleanup), commands as a person runs them (`engine read voice ...`).
# CP-9 is not on main: the rebuild in 2 and 6 is the one on main, engine.assess.graph.rebuild.
PY=packages/engine/.venv/bin/python
P=specs/CP-10/proofs
T="$PY -m pytest -q -p no:cacheprovider --rootdir=$P"

check "1 at 48 hours a note's recording and transcript are gone, confirmed or not; kept before; no words in new lines" \
  $T $P/test_1_raw_gone_at_48h.py
check "2 the observation, evidence, her decisions and her sentence on the child's page stay after the clean-up" \
  $T $P/test_2_confirmed_stays.py
check "3 an n8n schedule calls /voice/cleanup; counts only; fails and retries; unreadable folder clears nothing; orphans; set-once times" \
  $T $P/test_3_cleanup_runs_itself.py
check_box "3 live: no note older than 51 hours keeps its transcript and no recording file is older than 51 hours" \
  $PY $P/live_voice_cleanup.py
check "4 Sarvam no-retention is a setting, false by default, set on only with a reference by staff, logged; status prints it" \
  $T $P/test_4_sarvam_setting.py
check "5 the data register's voice entry says the decided words" \
  $T $P/test_5_register_wording.py
check "6 a confirmed voice note and the typed form give the same rows and state; an unconfirmed note gives nothing" \
  $T $P/test_6_same_as_typed.py
check "7 no recording, transcript word or name in git, logs, responses or command output, failed run included" \
  $T $P/test_7_no_raw_anywhere.py

finish
