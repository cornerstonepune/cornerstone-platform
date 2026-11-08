#!/usr/bin/env bash
# Acceptance proofs for CP-20. Written BEFORE the product code, by a different agent.
# After `athena lock CP-20` this file, spec.md and proofs/ cannot be edited.
# One `check` per "Done when" line, same numbering. Each check must be a real command.
source "$ATHENA_ROOT/.claude/athena/bin/checklib.sh"
cd "$ATHENA_ROOT"

# 1-3 and 5 run setup.sh in a scratch copy with bin/ci-postgres, bin/testdb, uv and npm stubbed (no install, no database).
# 4 needs the throwaway database itself: it can pass only in GitHub's proofs job, after setup.sh built it; elsewhere it
#   fails with the reason (no TEST_DATABASE_URL), never skips.
# 5 cannot time the real job offline: it proves the 30-minute limit is untouched and setup.sh adds no fixed waits.
P=specs/CP-20/proofs
check "1 in the job TEST_DATABASE_URL is a runner-local Postgres built by bin/testdb fresh; any other host stops setup" python3 $P/setup_sh.py job
check "2 in the job DATABASE_URL stays unset" python3 $P/setup_sh.py no-dburl
check "3 outside the job setup.sh starts no database and sets no database variable" python3 $P/setup_sh.py off-ci
check "4 test_test_database.py runs and passes in the job with none skipped" bash $P/db_test_file.sh
check "5 only setup.sh changes outside specs/CP-20/, and the 30-minute limit is untouched" python3 $P/setup_sh.py scope
check "6 fast checks pass" bash .claude/athena/fast-checks.sh

finish
