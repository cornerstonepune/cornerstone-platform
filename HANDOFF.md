# HANDOFF

_Overwritten at the end of every session. Keep under 30 lines. Facts only._

**Updated:** 2026-11-24 · **By:** Coordinator (loop:run, side session) · **Model:** claude-opus-5-5
**Milestone:** M6 K1 pilot · **Branch:** plan/coord-handoff · stopped at 150k context

## State
- **PR #942** (plan/fn10-rubric-words, ADR 0111): signed-off F.N 10 words on 15 rows, K1 added to also_bands of ACT-K2-M0018 + ACT-K2-0449, six new K1 activities (their words await Nimish's OK, docs/loop/notes/fn10-new-activity-words.md). CI GREEN. A reviewer subagent was running at session end: result unknown, rerun it.
- **Merging to main = going live**: .github/workflows/migrate.yml applies live's missing migrations after main's CI, then releases engine/site. So merging #942 puts the words on live. .loop.json release has require_go: true, so get Nimish's one-line go before merging #942.
- **#939** (enrol class --campus): attempts 1-3 FAILED only because the shared test DB lacked plan/t939's seed (K1 at both campuses) and the builder's handoff kept a Blocked section (loop finish refuses any Blocked section). Fable rescue passed locally (core 229 passed). `loop finish 939 --rescue` was running at session end with TEST_DATABASE_URL pointing at db t939: check `gh pr list` for its PR, then loop ci, reviewer, merge, `loop clean 939`.
- The rescuer left two untracked probe tests (test_zz_probe_939*.py) in the 939 build folder: not committed (outside ticket files); `loop clean 939` removes them.
- Local test DBs: postgres rebuilt fresh 24 Nov from plan/fn10-rubric-words; t939 built from plan/t939 (drop it after #939 merges). Run `git worktree prune` for this session's scratch worktrees.

## Next step
1. Nimish's go → merge #942 → after migrate-live runs, read back on live: 15 rows with 4 words, 2 rows with K1 in also_bands, 6 new K1 activities; tick G6.6.
2. #939 PR: CI, reviewer, merge.
3. ADR 0108 ticket 4 (form mark → activity_observation + evidence_event, G6.4) via loop plan, then build.
4. Small ticket: people.py:243 dry-run label "engine enrol k2"; stale "enrol k2" docstrings (people.py:1, signer.py:3, roster.py:130, tests/rows.py:427/449).
5. G6.5: load F.N 10 W1+W2 on live for Gurukul K1 after the CSV enrol. Close #931 in favour of this branch.

## Don't repeat
- A ticket that changes a seed needs a test DB built from its seed branch: build a separate DB (bin/testdb fresh …/t<N> from a scratch worktree of plan/t<N>) and pass TEST_DATABASE_URL to loop build/finish, before attempt 1. Tell the builder to delete its Blocked section once tests pass.
- Don't put export/VAR= in .loop.json commands or 2>&1 beside test paths in briefs. Don't re-ask K1's campus.
