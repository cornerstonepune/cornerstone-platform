# HANDOFF

_Overwritten at the end of every session. Keep under 30 lines. Facts only._

**Updated:** 2026-11-26 (~11:50 IST) · **By:** Coordinator (loop:run, side session local_07a3d48e) · **Model:** claude-sonnet-5-5
**Two lanes:** M6 K1 pilot (presentation TODAY) and profile mapping G1–G4 (ADR 0115) · **Branch:** plan/handoff (PR #949)

## K1 pilot — state (verified 12:01 IST)
- Live: K1-A 21 children, educator account, 99 lessons (23 Nov-4 Dec), **12 with an activity**, voice key set (test clip transcribed; no website voice note tried; educator sign-in unchecked).
- PR #952 released 12:00 (ci, migrate live, deploy engine green). Attached 26 Nov rhyme F001, 27 Nov art 1202, 30 Nov animals 0630; the rhyme's rubric seen on the live site. No mark saved on live.
- 5 still refused (G6.8, offer-only groups on a head): 30 Nov French rhyme 0665 + trace D F003; 1 Dec bottles 0783 + rhyme 0665; 2 Dec trace 6 F002. Past days refuse an activity: ship before 30 Nov.
- Nimish to OK the model-drafted level words of F001-F006 (`docs/loop/notes/fn10-new-activity-words.md`).
- Next: ticket G6.8 (before 30 Nov); tick PROJECT.md G6.5/G6.6/G6.7 as live proves; merge #949.
- Tickets: educator chooses activity on S3; voice confirm defaults to the lesson's activity; 30 s recorder cap; silent voice failure; #948 review notes; "enrol k2" labels.

## Profile mapping — state
- #953 on main (migration `20270219090000_skill_profile_group.sql`, skill `skill-group` v1 inactive, 32 DRAFT gold cases). Tickets a–g per ADR 0115/0116 (plan/profile-tickets).
- Ask Nimish: mark `supabase/seed/skills/skill-group/gold.json` (esp. 12 with `doubt`); after deploy `engine staff grant <his email> profile_approver --by …`.

## Don't repeat
- One owner per PR. Give heavy steps to subagents (four sessions ran out of context). `loop build` splits --allowedTools: use the loop:builder(-small) subagent.
- An ADR Goal line naming a PROJECT.md goal must read `Goal: none — proved by …`.
- Main checkout may be on another session's branch: use a worktree, never switch it. Separate test DB per job, not `postgres`.

## Blocked / unverified
- `nightly` on main failed 25 and 26 Nov. Never print child names; passwords/keys typed by Nimish only.
