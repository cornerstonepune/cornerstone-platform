#!/usr/bin/env bash
# Acceptance proofs for CP-23. Written BEFORE the product code, by a different agent.
# After `athena lock CP-23` this file, spec.md and proofs/ cannot be edited.
# One `check` per "Done when" line, same numbering. Each check must be a real command.
source "$ATHENA_ROOT/bin/checklib.sh"
cd "$ATHENA_ROOT"

# Plants are untracked files in the working tree, removed (and rules.json restored) by each proof's EXIT trap; nothing
# is committed. Database proofs start their own throwaway Postgres (initdb in a temp folder, a free port, one empty
# database) and set TEST_DATABASE_URL to it; nothing reaches production. Each bin/check run takes ~25 s by itself, so
# the whole file takes about four minutes.
P=specs/CP-23/proofs

check "1 no database: bin/check fails on a grade code K2 in a .py outside assess/ and on a screen saying borrow" \
  bash $P/c1_grade_and_borrow.sh
check "2 bin/check fails on a branch migration numbered at or before origin/main's newest and on a shared version" \
  bash $P/c2_migration_numbers.sh
check "3 bin/check --db builds the schema from the migrations and fails on a table with no owner" \
  bash $P/c3_ownerless_table.sh
check "4 bin/check --db fails on a stale rules.json and prints run \`engine live rules --write\`" \
  bash $P/c4_rules_json_stale.sh
check "5 bin/check --db runs test_grades.py and test_rules.py with no skips, and passes on an unplanted tree" \
  bash $P/c5_db_tests_no_skips.sh
check "6 bin/check --claude runs the --db checks when TEST_DATABASE_URL is set (fails on an ownerless table)" \
  bash $P/c6_claude_gate.sh
check "7 bin/check without --db opens no database, passes on a clean tree, and finishes in under 60 s" \
  bash $P/c7_no_database_fast.sh
check "8 learnings.md has a card: number a migration just after origin/main's newest, check with bin/check --db" \
  python3 $P/c8_learning_card.py

finish
