# HANDOFF

_Overwritten at the end of every session. Keep under 30 lines. Facts only._

**Updated:** 2026-11-28 · **By:** staff-table side session (loop:run) · **Model:** claude-sonnet-5-5
**Lanes:** staff table (ready to plan) · M6 K1 pilot (G6.8 live) · profile mapping G1–G4 · **Branch:** plan/staff-table (no PR yet)

## Staff table /setup/staff — asked 28 Nov, nothing built
- Findings and facts: `docs/loop/handoff/staff-table.md`. Read it first. Decided (ADR 0118): owner = all co-founders; columns Email, Password status, Last sign-in, Phone. Ask him before merge or release.
- Address check done. PR #961 (`plan/new-address`: live watch + deploy.md): CI green. Next: `reviewer` on it, then ask Nimish before merge. Until merged the watch will likely report "sign-in page answered 307".
- Waiting on Nimish: set production `NEXT_PUBLIC_SITE_URL` to https://console.cornerstoneschool.in and redeploy? (still the old address)
- Next: `loop plan` the revised S50-staff wireframe (he approves), then `loop plan` tickets and seeds. Tests this session: only #961 CI.
- Don't repeat: the loop's approve-command text inside a shell command trips the hook, even in a note.

## K1 pilot — state (verified 28 Nov 13:06 IST)
- Live: K1-A 21 children, educator account, 99 slots (23 Nov-4 Dec). **17 of 45 teaching slots have a rubric** (rest: 14 Sports Day practice, 10 past 23-25 Nov, 4 with no activity attached). Voice key set. #952 and #957 released.
- Unproven: 0 K1 marks, 0 evidence; no mark on live has produced evidence_event; child summaries last computed 18 Nov; no website voice note tried; educator sign-in unchecked.
- Next: (1) save one real mark; trace it to evidence_event and the child page. (2) Tick PROJECT.md G6.5-G6.8 as live proves; merge #949; `loop clean 955`; remove worktree scratchpad/g68.
- Nimish to OK model-drafted level words of F001-F006. Tickets: educator picks activity on S3; later fortnights' load; voice confirm default; 30 s cap; silent voice failure; add test_k1_offer_only.py to tests/core.txt; `tt_edit.py:120` checks the old subject; #948 notes.

## Profile mapping — state (from main, #958)
- LIVE: 399 objective→skill links (G1–G4), 244 skill groups, approver Nimish; migration 20270222090000. Model-drafted, 67 groups unsure, no educator review.
- 25 objectives have no fitting skill (new skills or Nimish's call). K1/K2 out of scope. PRs #954/#956 superseded: close them.
- Nimish asked that this work run directly, without loop tickets/planner/builder sessions.

## Don't repeat / blocked
- One owner per PR. Long sessions stall on the context budget. `loop build` splits --allowedTools; a builder under a scratchpad worktree gets no shell: let `loop finish` run the checks.
- An ADR Goal line naming a PROJECT.md goal must read `Goal: none — proved by …`.
- Main checkout may be on another session's branch: use a worktree, never switch it. Separate test DB per job.
- Open live alert #557: "the nightly rebuild has never run ok". `nightly` on main failed 25 and 26 Nov. Never print child names; passwords/keys typed by Nimish only.
