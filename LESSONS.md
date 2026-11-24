# Lessons

_One line per failure, newest first. Written by the orchestrator whenever review fails, a ticket escalates, or Nimish corrects something. Reviewed monthly: a layer that keeps appearing is where to invest next._

| Date | What went wrong | Layer | Durable fix (file/rule/test added) |
|---|---|---|---|
| <date> | <one line> | spec · process · toolbox · proof | <what changed so it can't recur> |
| 2026-11-24 | Two `loop plan` jobs given a whole milestone (survey + milestone + tickets + seeds + PR) each hit CONTEXT FULL; ~20 min and double context-loading before one seed existed | process | One deliverable per `loop plan` job (one seed branch, or one ADR), briefed with the files and decisions already settled so it never re-surveys |
| 2026-11-24 | loop-guard judged builder rules on `git diff Plan-base...HEAD`, so main merged into a build branch after Plan-base (`loop prep`, `gh pr update-branch`) counted as builder work: PR #929 failed on HANDOFF.md, ADR 0109 and budget it never touched | proof | `.github/loop/check_pr.py` reads only the builder's non-merge commits not on the base branch; `packages/engine/tests/test_loop_guard.py` builds that history (nightly full suite, not `core`; proven red on the old guard, green on the fix) |
| 2026-11-24 | `loop build 926` run 1: builder refused pytest, `bin/check` and `git commit`, stopped with edits uncommitted (same denials hit #925). `loop build` uses `--permission-mode dontAsk` with a `Bash(<word> *)` allowlist, so `cd … &&`, pipes, `export X=`, heredoc commits and `bin/…` never match | toolbox | Coordinator appended a "Shell note" to the brief (one simple command per call, `uv run --directory packages/engine pytest …`, single-line `git commit -m`); run 2 passed. Durable fix belongs in the loop plugin: put that note in BUILDER_RULES, allow `bin/check` |
