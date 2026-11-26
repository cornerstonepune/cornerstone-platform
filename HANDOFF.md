# HANDOFF

_Overwritten at the end of every session. Keep under 30 lines. Facts only._

**Updated:** 2026-11-26 (K1 secure = 1 adult) · **By:** planning helper · **Model:** claude-sonnet-5-5
**Milestone:** M6 K1 pilot (presentation TODAY) · **Branch:** plan/k1-pilot-offers (PR #952)

## State
- PR #952 NOT merged; nothing changed on live. Today's rhyme (F001) still has no activity.
- `tests/test_k1_pilot_offers.py` on local DB `k1offers`: **9 passed**; with the migration blanked: 8 failed, 1 passed. Ruff clean.
- PROJECT.md G6.7/G6.8, ADR 0113 and the PR text now match the code. Nothing ticked. CI verdict: `loop ci 952`.
- Nimish, 26 Nov: K1 "secure" needs 1 adult. The migration copies `min_adults` from K2 and the test asserts 1.
- Branch is checked out in the worktree `.../7fe176f5-4495-4264-b693-db9898f54842/scratchpad/k1`: work there, or `git worktree remove` it first.
- Main checkout is on `plan/profile-groups` with someone's uncommitted work: do not switch it. Its new migration has the SAME number 20270218090000: whichever merges second must be renumbered.

## Next step (urgent, in order)
1. CI green → loop:reviewer → `gh pr merge 952 --squash --delete-branch`; confirm `migrate live` + `deploy engine`.
2. Attach (ADR 0114 on plan/handoff): `attach.py` in `~/Library/Application Support/Claude/side-session-notes/local_07a3d48e-bf4c-43ef-98fc-95c421cdfa35/`, piped to `sudo docker exec -i deploy-engine-1 python -` on ubuntu@3.111.248.87; dry run: expect 3 of 8 ok (26, 27, 30 Nov wild animals), then `--apply`.
3. Check a rubric on the live site; tick G6.x only as live proves; resolve HANDOFF clash; merge #949 (BLOCKED, cause unchecked).
4. Then ticket G6.8: offer-only groups on a head (5 lessons, first on 30 Nov); plus the ticket list in plan/handoff HANDOFF.

## Ask Nimish
- Nothing on #952. 26 Nov he approved the F001-F006 skill links and K1 observed weights + rule = K2 ("yes"), ADR 0113.

## Don't repeat
- An ADR Goal line naming a PROJECT.md goal must read `Goal: none — proved by …`, or test_promises takes the rest as a path.

## Blocked / unverified
- `nightly` on main failed 25 and 26 Nov. Never print child names; passwords/keys typed by Nimish only.
