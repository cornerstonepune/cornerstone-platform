# HANDOFF

_Overwritten at the end of every session. Keep under 30 lines. Facts only._

**Updated:** 2026-11-26 (~12:50 IST) · **By:** Coordinator (loop:run, side session local_07a3d48e) · **Model:** claude-sonnet-5-5
**Lanes:** M6 K1 pilot (G6.8 merged, releasing) · profile mapping G1–G4 (ADR 0115, #953 merged) · **Branch:** plan/handoff (PR #949)

## K1 pilot — state (verified 13:06 IST)
- Live: K1-A 21 children, educator account, 99 slots (23 Nov-4 Dec). **17 of 45 teaching slots have a rubric** (rest: 14 Sports Day practice, 10 past 23-25 Nov, 4 with no activity attached). Voice key set.
- #952 and #957 (G6.8) released; the five G6.8 lessons attached 13:05; Smelling Bottles rubric seen on the live site. G6.8 is done on live.
- Unproven: 0 K1 marks, 0 evidence; no mark on live has produced evidence_event; child summaries last computed 18 Nov; no website voice note tried; educator sign-in unchecked.
- Next: (1) Nimish/educator saves one real mark; trace it to evidence_event and the child page. (2) Tick PROJECT.md G6.5-G6.8 as live proves (plan PR); merge #949; `loop clean 955`; remove worktree scratchpad/g68.
- Nimish to OK model-drafted level words of F001-F006. Tickets: educator picks activity on S3 (today only a coordinator can); later fortnights' load; voice confirm default; 30 s cap; silent voice failure; add test_k1_offer_only.py to tests/core.txt; `tt_edit.py:120` checks against the old subject; #948 notes.

## Profile mapping — state (from main)
- #953 on main (migration `20270219090000_skill_profile_group.sql`, skill `skill-group` v1 inactive, 32 DRAFT gold cases). Tickets a–g per ADR 0115 §Consequence, seed branches `plan/t<N>`.
- Ask Nimish: mark `supabase/seed/skills/skill-group/gold.json` (esp. 12 with `doubt`); after deploy `engine staff grant <his email> profile_approver --by …`.

## Don't repeat / blocked
- One owner per PR. Give heavy steps to subagents. `loop build` splits --allowedTools; a builder under a scratchpad worktree gets no shell: let `loop finish` run the checks.
- An ADR Goal line naming a PROJECT.md goal must read `Goal: none — proved by …`.
- Main checkout may be on another session's branch: use a worktree, never switch it. Separate test DB per job, not `postgres`.
- `nightly` on main failed 25 and 26 Nov. Never print child names; passwords/keys typed by Nimish only.
