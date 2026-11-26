# HANDOFF

_Overwritten at the end of every session. Keep under 30 lines. Facts only._

**Updated:** 2026-11-26 (~12:50 IST) · **By:** Coordinator (loop:run, side session local_07a3d48e) · **Model:** claude-sonnet-5-5
**Lanes:** M6 K1 pilot (G6.8 merged, releasing) · profile mapping G1–G4 (ADR 0115, #953 merged) · **Branch:** plan/handoff (PR #949)

## K1 pilot — state
- Live: K1-A 21 children, educator account, 99 slots (23 Nov-4 Dec; 45 teaching, 12 with an activity), voice key set (no website voice note tried; educator sign-in unchecked). #952 released.
- #957 (ticket #955, G6.8, ADR 0117-k1-offer-only, `timetable.offers`) MERGED 12:46; releasing. 46 tests passed locally on DB `g68`; reviewer PASS. Its test file is not in tests/core.txt, so CI never ran it.
- Unproven: 0 K1 marks, 0 evidence; no mark on live has produced evidence_event; child summaries last computed 18 Nov. Nimish asked to save one real mark and trace it.
- Next: confirm release -> attach on live (route ADR 0114): 30 Nov 0665 + F003, 1 Dec 0783 + 0665, 2 Dec F002 (ACT-K1-*) -> check one rubric live -> tick PROJECT.md as live proves -> merge #949; `loop clean 955`.
- Nimish to OK model-drafted level words of F001-F006. Tickets: educator picks activity on S3; later fortnights' load; voice confirm default; 30 s cap; silent voice failure; #948 notes.
- Pre-existing: `tt_edit.py:120` checks a new activity against the lesson's old subject.

## Profile mapping — state (from main)
- #953 on main (migration `20270219090000_skill_profile_group.sql`, skill `skill-group` v1 inactive, 32 DRAFT gold cases). Tickets a–g per ADR 0115 §Consequence, seed branches `plan/t<N>`.
- Ask Nimish: mark `supabase/seed/skills/skill-group/gold.json` (esp. 12 with `doubt`); after deploy `engine staff grant <his email> profile_approver --by …`.

## Don't repeat / blocked
- One owner per PR. Give heavy steps to subagents. `loop build` splits --allowedTools; a builder under a scratchpad worktree gets no shell: let `loop finish` run the checks.
- An ADR Goal line naming a PROJECT.md goal must read `Goal: none — proved by …`.
- Main checkout may be on another session's branch: use a worktree, never switch it. Separate test DB per job, not `postgres`.
- `nightly` on main failed 25 and 26 Nov. Never print child names; passwords/keys typed by Nimish only.
