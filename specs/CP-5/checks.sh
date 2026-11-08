#!/usr/bin/env bash
# Acceptance proofs for CP-5. Written BEFORE the product code, by a different agent.
# After `athena lock CP-5` this file, spec.md and proofs/ cannot be edited.
# One `check` per "Done when" line, same numbering. Each check must be a real command.
source "$ATHENA_ROOT/.claude/athena/bin/checklib.sh"
cd "$ATHENA_ROOT"
PY=packages/engine/.venv/bin/python

# 1 LIVE: the advisor's function_search_path_mutable query over pg_proc, read-only, on the production database.
check_box "1 live database has no function with a mutable search path" $PY specs/CP-5/proofs/live_search_path.py

# 2 Some engine test reads proconfig for search_path; with a test database, an unpinned function makes it fail.
check "2 a function added without a fixed search path fails a test" $PY specs/CP-5/proofs/guard.py

# 3 docs/adr/NNNN-leaked-password-protection-does-not-apply.md, and no code reads auth.users.
check "3 leaked-password decision recorded and nothing reads Supabase Auth users" python3 specs/CP-5/proofs/auth_unused.py

# 4 Over `git ls-files`; the reference comes from SUPABASE_PROJECT_REF or a generic pattern, never from this folder.
check "4 no tracked file holds the live project reference" python3 specs/CP-5/proofs/project_ref.py

# 5 Tests unchanged here; the full suites passing is ci.yml's engine and web jobs; the calls run on the box.
check "5 engine and web tests unchanged since main" bash specs/CP-5/proofs/tests_unchanged.sh
check_box "5 each re-pinned function runs in a rolled-back read-only call" $PY specs/CP-5/proofs/repinned_calls.py

finish
