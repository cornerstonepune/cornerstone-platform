#!/usr/bin/env bash
# Acceptance proofs for CP-3. Written BEFORE the product code, by a different agent.
# After `athena lock CP-3` this file, spec.md and proofs/ cannot be edited.
# One `check` per "Done when" line, same numbering. Each check must be a real command.
source "$ATHENA_ROOT/.claude/athena/bin/checklib.sh"
cd "$ATHENA_ROOT"

# check "1 <the criterion in a few words>" <command that exits 0 only when it is true>

finish
