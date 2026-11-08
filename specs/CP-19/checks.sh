#!/usr/bin/env bash
# Acceptance proofs for CP-19. Written BEFORE the product code, by a different agent.
# After `athena lock CP-19` this file, spec.md and proofs/ cannot be edited.
# One `check` per "Done when" line, same numbering. Each check must be a real command.
source "$ATHENA_ROOT/.claude/athena/bin/checklib.sh"
cd "$ATHENA_ROOT"

# Items 1-6 use TEST_DATABASE_URL (a throwaway Postgres in the athena job) or build their own in a temp folder from
# every migration; never DATABASE_URL. Fake schools, children and staff ids only; every row is rolled back. Approvals
# and sends are made as the website makes them (app_web, app.staff_id set with set_config). Nothing is delivered to
# anyone and no model is called. Item 1 needs CP-4 (access_table) and items 5-6 need CP-9 (unplanned_sessions): they
# fail until those merge. Item 8 is LIVE: read-only, counts only, no names.
PY=packages/engine/.venv/bin/python
P=specs/CP-19/proofs
T="$PY -m pytest -q -p no:cacheprovider --rootdir=$P"

check "1 each line stored on its own with its confirmed, dated evidence; wrong child, unconfirmed or late evidence refused" \
  $T $P/test_lines.py
check "2 a line with less evidence than state.min_events shows thin; changing the row changes which" \
  $T $P/test_thin.py
check "3 two approvals per line, class educator then coordinator; same person, third, nobody, engine refused" \
  $T $P/test_approvals.py
check "4 only report_mark_sent marks sent: consent and register, every line approved twice, has lines, not sent" \
  $T $P/test_send.py
check "5 each per-class measure of coordinator_counts equals a direct count for the fortnight" \
  $T "$P/test_counts.py::test_5_each_class_measure_equals_a_direct_count"
check "6 per-educator figures are note counts only, no score or rank; coordinator sees all, educator own" \
  $T $P/test_counts.py -k test_6
check "7 k2_reads and the reports page read coordinator_counts; own counting gone; existing tests unchanged" \
  $T $P/test_one_place.py
check_box "8 LIVE: coordinator_counts for the current fortnight agrees with an independent read-only count" \
  $PY $P/live_counts.py

finish
