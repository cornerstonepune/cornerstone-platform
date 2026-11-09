---
name: done-verification
category: verification
description: Use when finishing a session, or checking a done-when.
---

# Prove done before saying done

"Done", "merged" and "status: done" are claims to check, not evidence. Run the fast checks after the last edit and read their result; check a task clause by clause against its done-when.

## Fast checks before finishing
- Run the repository's fast checks after your last edit and wait for the result before you finish. Edits under `specs/` count too: a docs-only spec commit still needs the fast checks green.
- Engine not installed ("engine is not installed yet: uv sync"): in a fresh cloud container run `uv sync` in `packages/engine` once, then the checks. Note it in the handoff as an environment step, not a code change.
- Long runs: write the output to a file and read that file. Do not pipe into `tail`, which stays empty until the process exits. Use `set -o pipefail` so the check's own exit status is the result.
- Do not end the turn while checks run. Wait, read the result, then report.
- A failure is fixed at its cause (CLAUDE.md rule 11). Never raise a limit or loosen a rule to get past it.
- Runtime files (`.claude/autoharness/`, `*.ledger.jsonl`, `*.sidecar.json`) show as changed. Leave them out of commits and say so in one line.
- Say "passes" only when the output you read shows it.
- If a hook rewrote a Bash call and the classifier denies it, follow the Bash-denied rule in the tool-results-and-hooks skill.

## Reconcile a task against its done-when
1. Copy the done-when verbatim and split it into numbered clauses. Give each clause one verdict: MET, PARTLY, NOT MET or CANNOT VERIFY HERE, citing file:line, a migration name, or a commit sha with its PR number.
2. Match work by content (the diff and the files it touches), never by the ID in the title. IDs collide.
3. If a threshold was lowered after it was measured, judge the result against the original wording and name the change. Do not call it MET.
4. Clauses about real use need a read-only live query run in the main session, or they stay CANNOT VERIFY HERE. Delegated reviewers often cannot reach the database.
5. Every NOT MET or PARTLY clause gets a goalpost: an observable outcome plus the command or query that checks it. List work built that the done-when did not ask for.
6. No partial sweeps. Name unchecked tasks and stopped runs (cost cap, timeout); never extrapolate.

Checklist: `references/reconcile-checklist.md`. Reviewer fan-out is fine for a large batch: one read-only reviewer per group of tasks, each given the done-when text.
