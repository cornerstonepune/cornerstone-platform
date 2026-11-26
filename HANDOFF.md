# HANDOFF

_Overwritten at the end of every session. Keep under 30 lines. Facts only._

**Updated:** 2026-11-26 (~11:30 IST) · **By:** Coordinator (loop:run, side session local_07a3d48e) · **Model:** claude-sonnet-5-5
**Milestone:** M6 K1 pilot (presentation TODAY) · **Branch:** plan/handoff (PR #949)

## State
- Live: K1-A 21 children, educator account, 99 lessons (23 Nov-4 Dec), 9 with an activity, voice key set (test clip transcribed; no website voice note tried).
- PR #952 (plan/k1-pilot-offers, 3cb1f936a at 11:25) NOT merged; mergeable, checks not yet reported on that commit. Includes Nimish's "1 adult".
- Another session (local_609ff468, profile mapping) is also pushing to #952 and was told to review and merge it. This session's helper is stopped; it only waits to attach. Nimish asked who should finish.

## Tests
- tests/test_k1_pilot_offers.py: 9 passed on 644145584; later commits rely on CI.

## Next step
1. Merge of #952 (one owner only) -> confirm `migrate live` + `deploy engine`.
2. Attach on live (ADR 0114; attach.py in side-session notes local_07a3d48e): dry run expects 3 of 8 (26, 27, 30 Nov), then --apply. Check one rubric on the site.
3. Tick PROJECT.md goals only as live proves; merge #949.
4. Tickets: offer-only groups on a head (5 lessons, first 30 Nov); educator chooses activity on S3; voice confirm defaults to the lesson's activity; 30 s recorder cap; silent voice failure; #948 review notes; "enrol k2" labels.

## Blocked / unverified
- Educator sign-in and a full website voice note unchecked. `nightly` on main failed 25 and 26 Nov.

## Don't repeat
- Two sessions writing one PR restarts checks and confuses Nimish: name one owner.
- Four sessions ran out of context on this fix: give heavy steps to subagents.
- `loop build` passes --allowedTools space-joined: use the loop:builder(-small) subagent.
