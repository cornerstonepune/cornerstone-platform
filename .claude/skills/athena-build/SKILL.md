---
name: athena-build
model: sonnet
description: Use to build a scoped change end to end, for example "build UNC-12". Runs scope first if the spec isn't locked, then plans, builds test-first until every locked proof passes, verifies independently and ships a pull request. Works unattended in routines.
---

# athena-build: from locked scope to a merged pull request

Announce: "Building <ID> under the Athena loop."

1. **Locked scope?** If `specs/<ID>/LOCK` does not exist, run the `athena-scope` skill first.
2. **Branch.** If you are on `main` or `master`, `git checkout -b <id-lowercase>-<short-slug>`. Cut it from main, never from an unmerged branch (`athena start` refuses that). Do not start a build while another open pull request changes a `migrations/` folder (`gh api repos/{owner}/{repo}/pulls?state=open`, then `pulls/<n>/files`): one database change at a time.
3. **Start.** Run `python3 .claude/athena/bin/athena start <ID>`. From now on the stop gate holds the session until the proofs pass.
4. **Understand.** Read:
   - the repo's `CLAUDE.md` and `specs/<ID>/spec.md`;
   - the proofs, which are read-only;
   - `docs/athena/learnings.md`;
   - the code the change touches.
   Check whether a well-maintained open-source package already solves a generic part (adopt before you build).
5. **Plan.** Use the `writing-plans` skill. Save the plan to `specs/<ID>/plan.md`. Each task names the *Done when* numbers it serves. Anything that serves no number is out of scope: drop it.
6. **Build.**
   - Use `subagent-driven-development` for multi-task plans; build a small plan yourself, task by task.
   - Every task follows `tdd`, with unit tests in the repo's normal test folders.
   - After each task, run `python3 .claude/athena/bin/athena done <ID>`.
   - Use `diagnosing-bugs` when a failure isn't obvious.
   - A task tagged `[capability: NAME]` waits for its decision record in `docs/decisions/` (search with find-skills first).
   - Fix product code only; the proofs are locked.
7. **Preflight.** If the repository has `.claude/athena/preflight.sh`, run `python3 .claude/athena/bin/athena preflight` once the proofs pass, and again before any push; stop if it exits non-zero and fix what it shows (it finds in minutes what CI finds in half an hour).
8. **No regressions.** When the proofs pass, run the repo's full test suite and linters if they exist, and fix what you broke.
9. **Stop rule.** Run `python3 .claude/athena/bin/athena block <ID> "<plain-English reason>"` and stop when:
   - the same failure repeats three times;
   - a proof looks wrong;
   - the scope is ambiguous; or
   - you need access, credentials or a decision.
   In a routine or unattended run, never ask a question: block instead.
10. **Verify.** Run the `athena-verify` skill.
11. **Ship.** Run the `athena-ship` skill. It merges the pull request itself when every gate holds, then reports to Nimish.

Never claim progress without fresh `athena done` output from this session.
