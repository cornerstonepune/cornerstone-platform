---
name: verify-before-done
category: verification
description: Use when calling work done or checking a task's done-when.
---

# Verify before calling work done

"Done", "passes" and "merged" are claims that need output you read in this session. Run the checks after your last edit and wait for the result; judge a task clause by clause against its done-when, never by its status.

## Fast checks after the last edit

- Run `.claude/athena/fast-checks.sh` after your last edit, including edits that only touch `specs/`. Wait for it; do not end the turn while it runs.
- Long runs: write output to a file, use `set -o pipefail`, and read the file. Piping into `tail` shows nothing until the process exits.
- A failure is fixed at its cause (CLAUDE.md rule 11). Layout drift from `workflows.json` means fixing the map or the code against `packages/engine/tests/test_layout.py`; never raise a limit or loosen a rule.
- Say "passes" only when the output you read shows it. Setup steps and runtime-file noise are in `references/gate-details.md`.

## Reconcile a task against its done-when

"Merged" or "status: done" is a claim to check, not evidence.

1. Copy the done-when verbatim and split it into numbered clauses.
2. Give each clause one verdict: MET, PARTLY, NOT MET, or CANNOT VERIFY HERE. Cite file:line, a migration name, or a commit sha with its PR number.
3. Match work by content (diff and touched files), never by the ID in the title; IDs collide.
4. If a threshold was lowered after measurement, judge against the original wording and name the change. Do not call it MET.
5. Clauses about real use need a read-only live query run in the main session, or stay CANNOT VERIFY HERE.
6. List unrequested work built, and features whose tables exist but hold zero rows.
7. Every NOT MET or PARTLY clause gets a goalpost: an observable outcome plus the command or query that checks it.
8. No partial sweeps: name any task not checked, and any stopped run (cost cap, timeout). Do not extrapolate.

For a large batch, fan out one read-only reviewer per group of tasks, each given its done-when text. Batch checklist: `references/reconcile-checklist.md`.
