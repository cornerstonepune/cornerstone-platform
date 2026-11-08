#!/usr/bin/env bash
# Acceptance proofs for CP-0. Written BEFORE the product code, by a different agent.
# After `athena lock CP-0` this file, spec.md and proofs/ cannot be edited.
# One `check` per "Done when" line, same numbering. Each check must be a real command.
source "$ATHENA_ROOT/.claude/athena/bin/checklib.sh"
cd "$ATHENA_ROOT"

# 2 reads issue titles from $CP0_ISSUE_TITLES_JSON if set, else the committed snapshot specs/CP-0/issue-titles.json
#   (refresh it with: python3 specs/CP-0/proofs/plan.py fetch-titles). No network call inside the proof.
check "1 id_prefix is CP and next-id on an empty checkout prints CP-1" python3 specs/CP-0/proofs/plan.py next-id
check "2 plan lists exactly CP-1..CP-19, each with a GitHub issue titled by its ID" python3 specs/CP-0/proofs/plan.py issues
check "3 no status words in the plan's table" python3 specs/CP-0/proofs/plan.py no-status
check "4 HANDOFF points to the plan and is under 50 lines" python3 specs/CP-0/proofs/plan.py handoff
check "5 fast checks pass" bash .claude/athena/fast-checks.sh

finish
