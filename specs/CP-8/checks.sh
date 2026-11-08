#!/usr/bin/env bash
# Acceptance proofs for CP-8. Written BEFORE the product code, by a different agent.
# After `athena lock CP-8` this file, spec.md and proofs/ cannot be edited.
# One `check` per "Done when" line, same numbering. Each check must be a real command.
source "$ATHENA_ROOT/.claude/athena/bin/checklib.sh"
cd "$ATHENA_ROOT"

P=specs/CP-8/proofs
# Database tests: the throwaway copy (TEST_DATABASE_URL, `bin/testdb fresh`), placeholder rows, one rolled-back transaction.
# LIVE parts: check_box, read-only (default_transaction_read_only), counts only, per fortnight (design decision 10).

check_box "1 live: no K2 line with a match is left unlinked; share linked printed and meets any recorded target" bash $P/box_link_share.sh
check "1 the dry run counts lines per fortnight and writes nothing" bash $P/pytest.sh "$P/test_fortnight_report.py::test_the_dry_run_counts_lines_per_fortnight_and_writes_nothing"

check_box "2 live: every K2 plan line is linked or on plan_unmatched with a reason" bash $P/box_none_silent.sh
check "2 every unlinked line is on plan_unmatched with the right reason, also after an undo and a new line" sh -c \
  "bash $P/pytest.sh $P/test_unmatched_list.py && bash $P/pytest.sh '$P/test_fortnight_report.py::test_the_unmatched_list_puts_each_line_under_its_fortnight_with_its_reason'"

check_box "3 live: every FN10 lesson period opens an activity or is on the unmatched list; none lacks a plan line" bash $P/box_fn10_periods.sh

check "4 a run records the rule on each line it links and undoes as a whole, leaving loader and hand links" bash $P/pytest.sh $P/test_link_run.py

check "5 a decision on showing a draft marked not written yet is recorded" python3 $P/draft_decision.py

check "6 existing engine and website tests (pages and speed) unchanged since main" bash $P/tests_unchanged.sh

finish
