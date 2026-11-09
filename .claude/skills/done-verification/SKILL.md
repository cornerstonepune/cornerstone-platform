---
name: done-verification
description: Use when checking done-when or fast checks block finishing.
category: verification
---

# Done verification: a claim of done needs evidence, checked per clause

"Merged", "status: done" or "passes" is a claim to check, not evidence. Before finishing a session that changed files, run the fast checks and wait for them; before calling a task done, give every done-when clause its own verdict backed by code, a recorded run, or a live measurement.

## Session gate: fast checks before finishing

- Run the repository's fast checks after your last edit and wait for their result before you finish. The gate counts any edit, including a docs-only spec commit: a change to `specs/` still needs `.claude/athena/fast-checks.sh` green.
- Engine not installed ("engine is not installed yet: uv sync"): in a fresh cloud container run `cd /home/user/cornerstone-platform/packages/engine && uv sync` once, then the checks. Note it in the handoff as an environment step, not a code change.
- Long runs: write the output to a file and read that file. Do not pipe into `tail`; the output stays empty until the process exits. Use `set -o pipefail` so the check's own exit status is the result.
- Do not end the turn while checks run. Wait for the background task, read its result, then report.
- Failures are fixed at the cause (CLAUDE.md rule 11). "bin/check failed: code drifted from workflows.json" means fix the map or the code against `packages/engine/tests/test_layout.py`; never raise a limit or loosen a rule.
- Runtime files are not yours to commit: plugin writes under `.claude/autoharness/` and `*.ledger.jsonl` / `*.sidecar.json` show as changed to the gate. Leave them out of commits and say so in one line.
- Permission rewrites: if the classifier denies a call because a hook rewrote its input, reissue that exact input once; if denied again, report it to Nimish and stop retrying.
- Say "passes" only when the output you read shows it.
- A number a builder or subagent reports ("17 of 20 passed") is theirs. Attribute it ("the builder reports ...") or read the run yourself before repeating it as a result. Re-run any command that failed earlier before claiming a check passes.
- If the done-gate fires again after you answered "no check applies", the trigger is still in the tree. Delete the scratch files it names when they sit outside the repository, or run the named check. Restating "no check applies" does not clear the gate and loops every stop.

## Task audit: reconcile a done-when clause by clause

1. Copy the done-when text verbatim and split it into numbered clauses.
2. Verdict per clause: MET, PARTLY, NOT MET, or CANNOT VERIFY HERE. Cite file:line, a migration name, or a commit sha with its PR number.
3. Match work by content (the diff and the files it touches), never by the ID in the title. IDs collide.
4. If a threshold was lowered after it was measured, judge the result against the original wording and name the change. Do not call it MET.
5. Clauses about real use (a message sent, an approval, a count on live data) need a read-only live query or stay CANNOT VERIFY HERE. Run the query in the main session: delegated reviewers often cannot reach the database.
6. List work built that the done-when did not ask for, and features whose tables exist but hold zero rows.
7. Every NOT MET or PARTLY clause gets a goalpost: an observable outcome plus the command or query that checks it.
8. No partial sweeps. If a batch is not fully checked, name the tasks that were not and do not extrapolate. Stopped runs (a cost cap, a timeout) are counted and named.

Reviewer fan-out is fine for a large batch: one read-only reviewer per group of tasks, each given the done-when text. Per-batch checklist: `references/reconcile-checklist.md`.
