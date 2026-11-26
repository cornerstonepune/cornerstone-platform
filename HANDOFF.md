# HANDOFF

_Overwritten at the end of every session. Keep under 30 lines. Facts only._

**Updated:** 2026-11-26 (~11:05 IST) · **By:** Coordinator (loop:run, side session local_07a3d48e) · **Model:** claude-sonnet-5-5
**Milestone:** M6 K1 pilot (presentation TODAY) · **Branch:** plan/handoff (PR #949)

## State
- Live: K1-A 21 children, educator account, 99 lessons (23 Nov-4 Dec), 9 with an activity, voice key set (test clip transcribed; no website voice note tried).
- PR #952 (plan/k1-pilot-offers, c7c3bf1a4+) NOT merged. A helper subagent of the coordinator is running its test, docs, push and CI in that branch's worktree.
- Main checkout is on plan/profile-groups with another session's uncommitted work: do not touch. Its migration shares number 20270218090000 with #952: the second to merge renumbers.

## Tests
- tests/test_k1_pilot_offers.py: result of the corrected version not yet reported.

## Next step
1. Helper reports -> loop:reviewer on #952 -> `gh pr merge 952 --squash --delete-branch` -> confirm `migrate live` + `deploy engine`.
2. Attach on live (ADR 0114; attach.py in side-session notes local_07a3d48e): dry run expects 3 of 8 (26, 27, 30 Nov), then --apply. Check one rubric on the site.
3. Tick PROJECT.md goals only as live proves; merge #949.
4. Tickets: offer-only groups on a head (5 lessons, first 30 Nov); educator chooses activity on S3; voice confirm defaults to the lesson's activity; 30 s recorder cap; silent voice failure; #948 review notes; "enrol k2" labels.

## Blocked / ask Nimish
- K1 "secure": 1 adult or 2 (stays 2)? Check F001-F006 skill links and K1 weights = K2.
- `nightly` on main failed 25 and 26 Nov.

## Don't repeat
- Four sessions ran out of context on this fix: give heavy steps to subagents.
- `loop build` passes --allowedTools space-joined: use the loop:builder(-small) subagent.
