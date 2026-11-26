# HANDOFF

_Overwritten at the end of every session. Keep under 30 lines. Facts only._

**Updated:** 2026-11-26 (~11:50 IST) · **By:** Coordinator (loop:run, side session local_07a3d48e) · **Model:** claude-sonnet-5-5
**Two lanes:** M6 K1 pilot (presentation TODAY) and profile mapping G1–G4 (ADR 0115) · **Branch:** plan/handoff (PR #949)

## K1 pilot — state
- Live: K1-A 21 children, educator account, 99 lessons (23 Nov-4 Dec), 9 with an activity, voice key set (test clip transcribed; no website voice note tried; educator sign-in unchecked).
- PR #952 MERGED 11:47 IST (1fbfa459c); releasing (`ci` -> `migrate live` + `deploy engine`). `test_k1_pilot_offers.py` 9 passed locally. Nimish decided all of ADR 0113.
- Next: confirm release -> attach (ADR 0114; `attach.py` in `~/Library/Application Support/Claude/side-session-notes/local_07a3d48e-bf4c-43ef-98fc-95c421cdfa35/`, piped to `sudo docker exec -i deploy-engine-1 python -` on ubuntu@3.111.248.87; dry run expects 3 of 8: 26, 27, 30 Nov; then `--apply`) -> check a rubric live -> tick PROJECT.md only as live proves -> merge #949.
- Tickets: G6.8 offer-only groups on a head (5 lessons, first 30 Nov); educator chooses activity on S3; voice confirm defaults to the lesson's activity; 30 s recorder cap; silent voice failure; #948 review notes; "enrol k2" labels.

## Profile mapping — state
- #953 on main (migration `20270219090000_skill_profile_group.sql`, skill `skill-group` v1 inactive, 32 DRAFT gold cases). Tickets a–g per ADR 0115/0116 (plan/profile-tickets).
- Ask Nimish: mark `supabase/seed/skills/skill-group/gold.json` (esp. 12 with `doubt`); after deploy `engine staff grant <his email> profile_approver --by …`.

## Don't repeat
- One owner per PR. Give heavy steps to subagents (four sessions ran out of context). `loop build` splits --allowedTools: use the loop:builder(-small) subagent.
- An ADR Goal line naming a PROJECT.md goal must read `Goal: none — proved by …`.
- Main checkout may be on another session's branch: use a worktree, never switch it. Separate test DB per job, not `postgres`.

## Blocked / unverified
- `nightly` on main failed 25 and 26 Nov. Never print child names; passwords/keys typed by Nimish only.
