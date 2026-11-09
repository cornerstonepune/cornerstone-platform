---
name: fast-checks-gate
description: Use when fast checks or the done-gate block finishing.
category: verification
---

# Fast checks before ending a session that changed files

Run the repository's fast checks after your last edit and wait for their result before you finish. The gate counts any edit, including a docs-only spec commit: a change to `specs/` still needs `.claude/athena/fast-checks.sh` green.

- **Engine not installed** ("engine is not installed yet: uv sync"): in a fresh cloud container run `cd /home/user/cornerstone-platform/packages/engine && uv sync` once, then the checks. Note it in the handoff as an environment step, not a code change.
- **Long runs**: write the output to a file and read that file. Do not pipe into `tail`; the output stays empty until the process exits. Use `set -o pipefail` so the check's own exit status is the result.
- **Do not end the turn while checks run.** Wait for the background task, read its result, then report.
- **Failures are fixed at the cause** (CLAUDE.md rule 11). "bin/check failed — code drifted from workflows.json" means fix the map or the code against `packages/engine/tests/test_layout.py`; never raise a limit or loosen a rule.
- **Runtime files are not yours to commit.** Plugin writes under `.claude/autoharness/` and `*.ledger.jsonl` / `*.sidecar.json` show as changed to the gate. Leave them out of commits and say so in one line.
- **Permission rewrites**: the RTK hook rewrites Bash input. If the classifier denies a call because a hook changed its input, reissue that exact input once; if denied again, report it to Nimish and stop retrying.
- Say "passes" only when the output you read shows it.
