# HANDOFF

_Overwritten at the end of every session. Keep under 30 lines. Facts only._

**Updated:** 2026-11-26 · **By:** side session (finish K1 release, 4th) · **Model:** claude-sonnet-5-5
**Milestone:** M6 K1 pilot (presentation TODAY) · **Branch:** plan/k1-pilot-offers (PR #952)

## State
- PR #952 NOT merged; nothing changed on live. Today's rhyme (F001) still has no activity.
- This commit puts ADR 0113 "Review, 26 Nov" into the migration, `config.json` and test, plus one test: an unlinked F00x fails the migration.
- Lint + that test file were still running at commit time: UNVERIFIED. Log (last line `EXIT 0` = pass): `/private/tmp/claude-501/-Users-nimishshah-cornerstone-cornerstone-platform/7fe176f5-4495-4264-b693-db9898f54842/scratchpad/k1test.log`
- Branch is checked out in the worktree `.../7fe176f5-4495-4264-b693-db9898f54842/scratchpad/k1` (same parent as the log): work there, or `git worktree remove` it first.
- Main checkout is on `plan/profile-groups` with someone's uncommitted work: do not switch it. Its new migration has the SAME number 20270218090000: whichever merges second must be renumbered.

## Next step (urgent, in order)
1. Read the log; if missing or failed, in `packages/engine`: `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54329/k1offers uv run pytest -q -p no:cacheprovider tests/test_k1_pilot_offers.py` (~6 min).
2. PROJECT.md: G6.7 = choices now offered (F001, 1202, 0630), new G6.8 = 0665, F003, 0783, F002 (ticket). Rewrite ADR 0113 status, Decisions 1 and 3, Consequences; PR title/body.
3. Push, CI, loop:reviewer, `gh pr merge 952 --squash --delete-branch`; confirm `migrate live` + `deploy engine`.
4. Attach (ADR 0114 on plan/handoff): `attach.py` in `~/Library/Application Support/Claude/side-session-notes/local_07a3d48e-bf4c-43ef-98fc-95c421cdfa35/`, piped to `sudo docker exec -i deploy-engine-1 python -` on ubuntu@3.111.248.87; dry run: expect 3 of 8 ok (26, 27, 30 Nov wild animals), then `--apply`.
5. Check a rubric on the live site; tick G6.x only as live proves; resolve HANDOFF clash; merge #949 (BLOCKED, cause unchecked).
6. Then ticket: offer-only groups on a head (5 lessons, first on 30 Nov); plus the ticket list in plan/handoff HANDOFF.

## Ask Nimish
- K1 "secure": 1 adult or 2 (stays 2 until they say)? Check the F001-F006 skill links and K1 weights = K2.

## Blocked / unverified
- `nightly` on main failed 25 and 26 Nov. Never print child names; passwords/keys typed by Nimish only.
