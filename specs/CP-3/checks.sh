#!/usr/bin/env bash
# Acceptance proofs for CP-3. Written BEFORE the product code, by a different agent.
# After `athena lock CP-3` this file, spec.md and proofs/ cannot be edited.
# One `check` per "Done when" line, same numbering. Each check must be a real command.
source "$ATHENA_ROOT/.claude/athena/bin/checklib.sh"
cd "$ATHENA_ROOT"

# 1-6 run on TEST_DATABASE_URL (GitHub's proofs job, CP-20) or, without it, on a Postgres made in a temp folder from
# every migration (needs initdb); never on DATABASE_URL. Fake rows, one rolled-back transaction per test, queried as a
# member of app_web with the identity set as the website sets it. 7 is the repository; 8 is the live database, read-only.
PY=packages/engine/.venv/bin/python
T=specs/CP-3/proofs/test_access_rules.py
B=specs/CP-3/proofs/test_browser_suite.py
run() { $PY -m pytest -q -p no:cacheprovider "$@"; }

check "1 groups are rows; a role's group or a group's kinds change by one insert or update" \
  run "$T::test_1_groups_are_rows_as_the_scope_lists_them" "$T::test_1_changing_a_roles_group_is_one_update" \
  "$T::test_1_adding_a_role_to_a_group_is_one_insert" "$T::test_1_changing_what_a_group_sees_is_one_update"
check "2 every role code is in exactly one group" \
  run "$T::test_2_every_role_belongs_to_exactly_one_group"
check "3 educator of X gets 0 rows of class Y's children, enrolment and notes" \
  run "$T::test_3_educator_of_x_sees_x" "$T::test_3_educator_of_x_gets_0_rows_of_y" \
  "$T::test_3_a_grant_not_current_gives_nothing"
check "4 no identity: 0 rows of children, enrolment, staff and notes" \
  run "$T::test_4_no_identity_sees_nothing" "$T::test_4_an_identity_that_is_no_one_sees_nothing"
check "5 everything group sees every row" \
  run "$T::test_5_everything_group_sees_every_row"
check "6 staff private details only for the everything group and the person" \
  run "$T::test_6_staff_details_only_for_everything_and_self"
check "7 browser and speed tests unchanged; the suite's user may see everything" \
  run "$B::test_7_existing_browser_and_speed_tests_unchanged" "$B::test_7_the_suites_user_is_in_the_everything_group"
check_box "8 live: no rule on the four kinds allows everyone; the site connects as app_web, not the owner" \
  $PY specs/CP-3/proofs/live_rules.py

finish
