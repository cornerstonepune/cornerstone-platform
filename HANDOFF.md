# HANDOFF

_Overwritten at the end of every session. Keep under 30 lines. Facts only._

**Updated:** 2026-11-26 · **By:** Coordinator (loop:run, side session) · **Model:** claude-sonnet-5-5
**Milestone:** M6 K1 pilot (Nimish presents to the K1 educator TODAY) · **Branch:** plan/handoff (PR #949)

## State (live)
- K1-A Gurukul: 21 children, educator + class_teacher radhika@cornerstoneschool.in. F.N 10 W1+W2: 99 lessons.
- 9 lessons have an activity (26 Nov hindi F004, beads 1146; 27 story 0975; 1-4 Dec stories, dustbin, swar, beads).
- Voice key SET on server (26 Nov); synthetic clip transcribed correctly. No website voice note tried yet (Nimish asked to record one on the beads lesson and NOT confirm). "No retention" in Sarvam unverified.
- S3 beads lesson checked in Chrome as Nimish: rubric, 21 children, Type the marks, Record. Radhika sign-in unchecked.

## Next step (urgent)
1. Branch plan/k1-pilot-offers (a30e4a59d, pushed, NO PR): ADR 0113, heads groups, F001-F006 skill links, K1 observed weights/rule, migration 20270218090000. The main checkout is on it with an UNCOMMITTED newer packages/engine/tests/test_k1_pilot_offers.py: that disk version is current. Run it (fresh test DB built: ...54329/k1offers), commit, update HANDOFF in that branch, open PR, CI, reviewer, merge (merge = live).
2. After release: attach 11-26 rhyme F001, 11-27 art 1202, 11-30 rhyme 0665 / trace D F003 / animals 0630, 12-01 bottles 0783 / rhyme 0665, 12-02 trace 6 F002 (ACT-K1-*), via tt_edit.edit on the server (route: ADR 0114; match session by date + text). 11-26 first; past days refuse.
3. Give Nimish ADR 0113's assumptions to check (K1 weights = K2; skill links).
4. Tick G6.5, G6.6. Merge #949.
5. Tickets: educator chooses activity on S3; voice confirm defaults to the lesson's activity; 30 s recorder cap; voice failure is silent; #948 review notes; "enrol k2" labels.

## Don't repeat
- `loop build` passes --allowedTools space-joined: builder shell calls are denied; use the loop:builder(-small) subagent.
- One job per planner/session; both ran out of context here.
