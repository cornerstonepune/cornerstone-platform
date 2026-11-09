---
name: verify-before-done
category: verification
description: Use when calling work done, or running fast checks.
---

# Verify before calling work done

"Done", "passes", "merged" and "status: done" are claims that need output you read in this session. Run the checks after your last edit, wait for the result, and judge a task clause by clause against its done-when, never by its status.

## Fast checks before finishing

- Run `.claude/athena/fast-checks.sh` after your last edit, including edits that only touch `specs/`; the gate counts a docs-only spec commit too. Wait for it; do not end the turn while it runs.
- Long runs: write output to a file, use `set -o pipefail`, and read the file. Piping into `tail` shows nothing until the process exits.
- "engine is not installed yet: uv sync" in a fresh cloud container: run `cd /home/user/cornerstone-platform/packages/engine && uv sync` once, then the checks. Note it in the handoff as an environment step, not a code change.
- A failure is fixed at its cause (CLAUDE.md rule 11). Layout drift from `workflows.json` means fixing the map or the code against `packages/engine/tests/test_layout.py`; never raise a limit or loosen a rule.
- Runtime files (`.claude/autoharness/`, `*.ledger.jsonl`, `*.sidecar.json`) show as changed to the gate. Leave them out of commits and say so in one line.
- Say "passes" only when the output you read shows it.

## Reconcile a task against its done-when

1. Copy the done-when verbatim and split it into numbered clauses.
2. One verdict per clause: MET, PARTLY, NOT MET, or CANNOT VERIFY HERE. Cite file:line, a migration name, or a commit sha with its PR number.
3. Match work by content (the diff and the files it touches), never by the ID in the title. IDs collide.
4. If a threshold was lowered after it was measured, judge against the original wording and name the change. Do not call it MET.
5. Clauses about real use (a message sent, an approval, a count on live data) need a read-only live query run in the main session, or stay CANNOT VERIFY HERE. Delegated reviewers often cannot reach the database.
6. List unrequested work built, and features whose tables exist but hold zero rows.
7. Every NOT MET or PARTLY clause gets a goalpost: an observable outcome plus the command or query that checks it.
8. No partial sweeps. Name any task not checked, and any stopped run (cost cap, timeout). Do not extrapolate.

For a large batch, fan out one read-only reviewer per group of tasks, each given its done-when text. Per-batch checklist: `references/reconcile-checklist.md`.
