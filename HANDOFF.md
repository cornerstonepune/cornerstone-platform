# HANDOFF

_Overwritten at the end of every session. Keep under 30 lines. Facts only._

**Updated:** 2026-11-26 (~11:50 IST) · **By:** Coordinator (loop:run, side session local_07a3d48e) · **Model:** claude-sonnet-5-5
**Two lanes:** M6 K1 pilot (presentation TODAY) and profile mapping G1–G4 (ADR 0115) · **Branch:** plan/handoff (PR #949)

## K1 pilot — state (12:30 IST)
- Live: K1-A 21 children, educator account, 99 slots (23 Nov-4 Dec; 45 teaching, **12 with an activity**), voice key set (no website voice note tried; educator sign-in unchecked). PR #952 released; today's rhyme rubric seen live.
- Unproven: 0 K1 marks, 0 evidence; no mark on live has ever produced evidence_event; child summaries last computed 18 Nov (auto refresh unchecked). Nimish asked: save one real mark and trace it.
- G6.8 = ticket #955 (seed plan/t955, ADR 0117-k1-offer-only; profile session also has an uncommitted ADR 0117: renumber one). Builder wrote tt_heads.offered_only; `loop finish 955` running from worktree scratchpad/g68 (DB g68).
- Next: finish -> CI -> loop:reviewer -> merge -> release -> attach 30 Nov 0665 + F003, 1 Dec 0783 + 0665, 2 Dec F002 (route ADR 0114) before 30 Nov -> check one rubric live -> merge #949.
- Nimish to OK model-drafted level words of F001-F006. Tickets: educator picks activity on S3; later fortnights' load; voice confirm default; 30 s cap; silent voice failure; #948 notes.

## Profile mapping — state
- #953 on main (migration `20270219090000_skill_profile_group.sql`, skill `skill-group` v1 inactive, 32 DRAFT gold cases). Tickets a–g per ADR 0115/0116 (plan/profile-tickets).
- Ask Nimish: mark `supabase/seed/skills/skill-group/gold.json` (esp. 12 with `doubt`); after deploy `engine staff grant <his email> profile_approver --by …`.

## Don't repeat
- One owner per PR. Give heavy steps to subagents (four sessions ran out of context). `loop build` splits --allowedTools: use the loop:builder(-small) subagent.
- An ADR Goal line naming a PROJECT.md goal must read `Goal: none — proved by …`.
- Main checkout may be on another session's branch: use a worktree, never switch it. Separate test DB per job, not `postgres`.

## Blocked / unverified
- `nightly` on main failed 25 and 26 Nov. Never print child names; passwords/keys typed by Nimish only.
