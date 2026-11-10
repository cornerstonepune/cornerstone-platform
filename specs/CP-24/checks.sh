#!/usr/bin/env bash
# Acceptance proofs for CP-24. Written BEFORE the product code, by a different agent.
# After `athena lock CP-24` this file, spec.md and proofs/ cannot be edited.
# One `check` per "Done when" line, same numbering. Each check must be a real command.
# Names are design.md's: move_child's 7th parameter `p_at`, the five keyed routes, `fortnight_cycle.CycleError`,
# `watch.problems` and `graph.nightly_stale_hours`. Database proofs (proofs/db/) run on TEST_DATABASE_URL, rolled back;
# the LIVE half of item 5 alone reads the live database, read-only, on the box.
source "$ATHENA_ROOT/bin/checklib.sh"
cd "$ATHENA_ROOT"

P=specs/CP-24/proofs
PY=packages/engine/.venv/bin/python
check "1a one clock: no current_date in a new migration, no hard-coded Asia/Kolkata in engine or website code" \
  bash $P/pytest.sh --no-db $P/test_one_clock.py
check "1b one clock: move_child and the engine's hand check date by internal.school_day in the database" \
  bash $P/pytest.sh $P/db/test_school_day.py -k test_1_
check "2 a child moved at 01:00 IST is enrolled from that IST day, not the day before" \
  bash $P/pytest.sh $P/db/test_school_day.py -k test_2_
check "3a POST /fortnight/state is a keyed engine route in the website's route list" \
  bash $P/pytest.sh --no-db $P/test_routes.py -k "unknown or fortnight_state"
check "3b POST /fortnight/move is a keyed engine route in the website's route list" \
  bash $P/pytest.sh --no-db $P/test_routes.py -k fortnight_move
check "3c POST /timetable/generate is a keyed engine route in the website's route list" \
  bash $P/pytest.sh --no-db $P/test_routes.py -k timetable_generate
check "3d POST /timetable/link is a keyed engine route in the website's route list" \
  bash $P/pytest.sh --no-db $P/test_routes.py -k timetable_link
check "3e POST /timetable/unmatched is a keyed engine route in the website's route list" \
  bash $P/pytest.sh --no-db $P/test_routes.py -k timetable_unmatched
check "4 the live watch reports step settings not in the order freeze > align > approve > list_sent; step_date still answers" \
  bash $P/pytest.sh $P/db/test_step_order.py
check "5 the live watch reports a nightly run older than graph.nightly_stale_hours" \
  bash $P/pytest.sh $P/db/test_nightly_watch.py
check_box "5 LIVE: the watch's nightly line agrees with the live graph_run ledger (read-only, no ids)" \
  $PY $P/live_nightly.py
check "6 docs/backup.md states Supabase's setting, Lightsail's retention, a dated restore drill and the 48-hour promise" \
  bash $P/pytest.sh --no-db $P/test_docs.py -k test_6_
check "7 docs/backend-plan.md has the rule: a Core scope a screen calls ships one keyed route" \
  bash $P/pytest.sh --no-db $P/test_docs.py -k test_7_

finish
