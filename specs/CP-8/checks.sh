#!/usr/bin/env bash
# Acceptance proofs for CP-8. Written BEFORE the product code, by a different agent.
# After `athena lock CP-8` this file, spec.md and proofs/ cannot be edited.
# One `check` per "Done when" line, same numbering. Each check must be a real command.
source "$ATHENA_ROOT/.claude/athena/bin/checklib.sh"
cd "$ATHENA_ROOT"

P=specs/CP-8/proofs
R=$P/test_fortnight_report.py
# Database tests: the throwaway copy (TEST_DATABASE_URL, `bin/testdb fresh`), placeholder rows, one rolled-back transaction.
# LIVE parts: check_box, read-only (default_transaction_read_only), counts only, per fortnight (design decision 10).

check_box "1 live: overall and in each fortnight no K2 line with a match is unlinked; share printed and meets any target" bash $P/box_link_share.sh
check "1 the share holds in each fortnight; the dry run counts per fortnight, one fortnight on request, and writes nothing" \
  bash $P/pytest.sh "$R::test_after_a_run_every_fortnight_meets_the_default_target" \
  "$R::test_the_dry_run_counts_lines_per_fortnight_and_writes_nothing" \
  "$R::test_the_dry_run_for_one_fortnight_reports_that_fortnight_only"

check_box "2 live: every K2 plan line is linked or on plan_unmatched with a reason and its fortnight" bash $P/box_none_silent.sh
check "2 every unlinked line is on plan_unmatched with the right reason and its fortnight, also after an undo and a new line" \
  bash $P/pytest.sh $P/test_unmatched_list.py "$R::test_the_unmatched_list_puts_each_line_under_its_fortnight_with_its_reason"

check_box "3 live: every FN10 lesson period opens an activity or is on the unmatched list; none lacks a plan line" bash $P/box_fn10_periods.sh

check "4 a run records its rule per line, can be limited to one fortnight, and undoes as a whole, leaving loader and hand links" \
  bash $P/pytest.sh $P/test_link_run.py "$R::test_the_command_applies_a_run_to_one_fortnight_and_undoes_it_as_a_whole"

check "5 a decision on showing a draft marked not written yet is recorded" python3 $P/draft_decision.py

check "6 existing engine and website tests (pages and speed) unchanged since main" bash $P/tests_unchanged.sh

finish
