# HANDOFF

_Overwritten at the end of every session. Keep under 30 lines. Facts only._

**Updated:** 2026-11-24 · **By:** Planner (test DB default) · **Model:** claude-opus-5-5
**Milestone:** M6 K1 pilot · **Branch:** plan/test-db-default · #925 (PR #929), #926 (PR #933), #934 (PR #935) merged

## State
- ADR 0108 tickets 1–3 done: K1 week reader + `load-k1`, `Session.planned`, `engine enrol class --grade` (reviewer PASS, CI green).
- #923 (people.py `_class_ids` reads `school.campus_grades` via `settings.config`): code committed in `.loop/wt/923` (51bf0d530), **2 of 3 attempts used, 1 left, no PR yet**. Attempt 1 failed only on the flaky test (#936); attempt 2 failed only because the builder wrote "Blocked: Bash was denied" in `docs/loop/handoff/923.md`, not on any test.
- Fixed on this branch: `tests/conftest.py` defaults `TEST_DATABASE_URL` to the bin/testdb copy (54329) when no `.env`/env names a database and `CI` is unset; `.loop.json` test_command now starts `cd packages/engine && uv run pytest`. Proven in a no-`.env` worktree: core 229 passed (old conftest: import error). Blanked vars (bin/check) and CI keep no database. `guard.py`'s `>`-is-a-write rule (blocks `2>&1` on commands naming a test file) NOT fixed (LESSONS.md).
- Flaky core test filed as #936 (`test_a_scan_read_whole`, KeyError 'missing'): passes on main, fails ~1 in 2 in build folders.

## Next step
1. After this PR merges: `gh pr update-branch`/re-prep #923 so its build folder has the new test_command and conftest. Consider a plugin fix for guard.py's `>` rule.
2. #923 last attempt: add to its Don't: "work is committed; run Done-when as written from the build folder; if green, delete the Blocked section". `loop prep 923` → `loop build 923` → `loop finish 923` → reviewer → merge.
3. Small follow-up ticket (reviewer on #935): `people.py:243` logs a dry run as "engine enrol k2 (dry run)" for any grade; stale "enrol k2" docstrings in people.py:1, signer.py:3, roster.py:130, tests/rows.py:427/449.
4. Then ADR 0108 ticket 4 (K1 form mark → activity_observation + evidence_event): `loop plan` seed.
5. Merge open handoff PR #931 (`plan/handoff`, checked out in another session's worktree) or close it in favour of this branch.

## Blocked / open questions (Nimish; block going live, not tickets)
- K1 campus: Gurukul (sheet title) or Neev (`school.campus_grades`)? Radhika sign-off on the F.N 10 rubric words (`docs/loop/notes/fn10-rubric-draft.md`)? Two-part cells reading B — confirm. Radhika's Children List CSV + email (Nimish runs enrol himself).
- Holiday cells (e.g. Tue 24 Nov "Academic 1 / General Awareness", "Block Room") make NO plan lines today; ADR 0108 says "nothing lost". Keep or drop them? Then pin it with a test.

## Don't repeat
- Don't spend a ticket attempt re-running `loop finish` on a flaky test without reading why it failed: my grep filter hid attempt 2's real reason.
- One deliverable per `loop plan` job. Sheet merges only via get_spreadsheet `fields: sheets.merges`. No grade code literal in Python (`test_grades`).
- Builders run `dontAsk` with a `Bash(<word> *)` allowlist: compound commands, pipes, `export`, heredoc commits get refused. After `loop prep`, append a shell note to the brief (one simple command per call, single-line `git commit -m`, no Blocked section).
- Seed cut from another seed branch conflicts once that ticket squash-merges: cherry-pick the seed's own commit onto main. After any merge to main: `gh pr update-branch` + `loop ci` before `gh pr merge`.
- `loop plan` runs in the main checkout: don't switch branches there while it runs. Dirty local test DB → drop + recreate `postgres` via template1, then `bin/testdb fresh`.
