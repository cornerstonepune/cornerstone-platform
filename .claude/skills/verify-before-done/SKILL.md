---
name: verify-before-done
category: verification
description: Use before saying done, or checking a task's done-when.
---

# Verify before you say done

"Done", "passes" and "merged" are claims. Back each one with output you read in this session, never with memory or a status label.

## Ending a session that changed files
- Run the repository's fast checks after your last edit and wait for the result. A docs-only commit to `specs/` still counts.
- Write long output to a file and read the file. Do not pipe into `tail`, which stays empty until the process exits. Use `set -o pipefail` so the check's own status is the result.
- Engine not installed ("engine is not installed yet: uv sync"): run `uv sync` once in `packages/engine`, then note it in the handoff as an environment step.
- Fix failures at their cause. Never raise a limit or loosen a rule to pass. Drift from `workflows.json` means fix the map or the code against `test_layout.py`.
- Runtime files (`.claude/autoharness/`, `*.ledger.jsonl`, `*.sidecar.json`) are not yours to commit. Say so in one line.
- If the RTK hook rewrote a Bash input and the classifier denies it, reissue that exact input once. If denied again, report it and stop.

## Checking a roadmap task against its done-when
- Copy the done-when verbatim, split it into numbered clauses, and give each clause one verdict: MET, PARTLY, NOT MET or CANNOT VERIFY HERE, citing file:line, a migration name, or a commit sha with its PR number.
- "Merged" or "status: done" is not evidence. Match work by diff content, never by the ID in the title.
- A threshold lowered after it was measured: judge the result against the original wording and name the change. Do not call it MET.
- Clauses about real use need a read-only live query run in the main session, or they stay CANNOT VERIFY HERE.
- Every NOT MET or PARTLY clause gets a goalpost: an observable outcome plus the command or query that checks it. List work built that the done-when did not ask for.
- No partial sweeps: name the tasks not checked and any stopped run (cost cap, timeout). Do not extrapolate.
- For a large batch, use one read-only reviewer per group, each given the done-when text. Run the checklist in `references/reconcile-checklist.md` per batch.
