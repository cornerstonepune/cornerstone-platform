#!/usr/bin/env bash
# 5: in the same setup (clean tree, TEST_DATABASE_URL an empty local database), `bin/check --db` runs test_grades.py
# and test_rules.py with no skips: every test of the two files is reported run (passed, failed or errored) at least
# once, and the run passes (exit 0): with the seed loaded and nothing planted, every database guard holds.
# A no-database pass that skips the database tests before the --db pass runs them is allowed.
# PYTEST_ADDOPTS makes every pytest run list each test with its outcome (it adds to bin/check's own flags).
source specs/CP-23/proofs/lib.sh
start_pg
out=$(DATABASE_URL= TEST_DATABASE_URL="$PG_URL" PYTEST_ADDOPTS="-vv -rs" bin/check --db 2>&1); rc=$?
printf '%s\n' "$out" | python3 specs/CP-23/proofs/no_skips.py test_grades.py test_rules.py || exit 1
[ "$rc" -eq 0 ] || { printf '%s\n' "$out" | tail -40; echo "bin/check --db exited $rc on a tree with nothing planted"; exit 1; }
