# HANDOFF

_Overwritten at the end of every session. Keep under 30 lines. Facts only._

**Updated:** 2026-11-26 (~11:30 IST) · **By:** Coordinator (loop:run, side session local_07a3d48e) · **Model:** claude-sonnet-5-5
**Two lanes:** M6 K1 pilot (presentation TODAY) and profile mapping G1–G4 (ADR 0115) · **Branch:** plan/handoff (PR #949)

## K1 pilot — state
- Live: K1-A 21 children, educator account, 99 lessons (23 Nov-4 Dec), 9 with an activity, voice key set (test clip transcribed; no website voice note tried; educator sign-in unchecked).
- PR #952 (plan/k1-pilot-offers, 3cb1f936a) NOT merged; CONFLICTING with main since #953 merged. Includes "1 adult". `test_k1_pilot_offers.py` 9 passed on 644145584.
- Another session (local_609ff468) is also pushing to #952 and was told to review and merge it. Nimish asked who should finish.
- Next: one owner resolves the conflict -> CI -> review -> merge -> `migrate live` + `deploy engine` -> attach (ADR 0114; attach.py in side-session notes local_07a3d48e; dry run expects 3 of 8: 26, 27, 30 Nov) -> check a rubric live -> tick PROJECT.md only as live proves.
- Tickets: offer-only groups on a head (5 lessons, first 30 Nov); educator chooses activity on S3; voice confirm defaults to the lesson's activity; 30 s recorder cap; silent voice failure; #948 review notes; "enrol k2" labels.

## Profile mapping — state (from main, #953 context)
- Migration `20270219090000_skill_profile_group.sql` finished (table, view, proposal kind `skill_group`, role `profile_approver`); proved on DB `pg_profile`; engine core 230 passed.
- Skill folder `supabase/seed/skills/skill-group/` (v1, inactive), 32 DRAFT gold cases.
- Needs Nimish: mark the gold in `.../skill-group/gold.json`; after deploy `engine staff grant <his email> profile_approver --by …`.
- Next: open the plan PR from plan/profile-groups, `loop ci`, merge; tickets a–g (ADR 0115).

## Don't repeat / blocked
- Two sessions writing one PR restarts checks and confuses Nimish: name one owner. Profile sessions: don't touch #952.
- Give heavy steps to subagents (four sessions ran out of context). `loop build` splits --allowedTools: use the loop:builder(-small) subagent.
- Use a separate test DB per job, not `postgres`. `nightly` on main failed 25 and 26 Nov.
