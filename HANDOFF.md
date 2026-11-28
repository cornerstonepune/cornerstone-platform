# HANDOFF

_Overwritten at the end of every session. Keep under 30 lines. Facts only._

**Updated:** 2026-11-28 · **By:** staff-table side session (loop:run) · **Model:** claude-sonnet-5-5
**Lanes:** staff table (waiting on Nimish) · M6 K1 pilot (G6.8 live) · profile mapping G1–G4 · **Branch:** plan/staff-table (no PR yet)

## Staff table /setup/staff — asked 28 Nov, nothing built
- Findings, open questions and next steps: `docs/loop/handoff/staff-table.md`. Read it first.
- Blocked: Nimish to say who "owner" is and which extra columns. Ask him before merge or release.
- Tests: none run (docs only). Next: record both answers, check the new site address, then `loop plan` (wireframe, tickets).
- Don't repeat: the loop's approve-command text inside a shell command trips the hook, even in a note.

## K1 pilot — state (verified 13:06 IST)
- Live: K1-A 21 children, educator account, 99 slots (23 Nov-4 Dec). **17 of 45 teaching slots have a rubric** (rest: 14 Sports Day practice, 10 past 23-25 Nov, 4 with no activity attached). Voice key set. #952 and #957 released; Smelling Bottles rubric seen on the live site.
- Unproven: 0 K1 marks, 0 evidence; no mark on live has produced evidence_event; child summaries last computed 18 Nov; no website voice note tried; educator sign-in unchecked.
- Next: (1) save one real mark; trace it to evidence_event and the child page. (2) Tick PROJECT.md G6.5-G6.8 as live proves; merge #949; `loop clean 955`; remove worktree scratchpad/g68.
- Nimish to OK model-drafted level words of F001-F006. Tickets: educator picks activity on S3; later fortnights' load; voice confirm default; 30 s cap; silent voice failure; add test_k1_offer_only.py to tests/core.txt; `tt_edit.py:120` checks the old subject; #948 notes.

## Profile mapping — state (from main, #958)
- LIVE: 399 objective→skill links (G1–G4), 244 skill groups, approver Nimish; migration 20270222090000. View check: kind 130 (was 0); 1,666 of 1,667 objectives reach a word. Model-drafted, 67 groups unsure, no educator review.
- 25 objectives have no fitting skill (new skills or Nimish's call). K1/K2 out of scope. PRs #954/#956 superseded: close them.
- Nimish asked that this work run directly, without loop tickets/planner/builder sessions.

## Don't repeat / blocked
- One owner per PR. Long sessions stall on the context budget. `loop build` splits --allowedTools; a builder under a scratchpad worktree gets no shell: let `loop finish` run the checks.
- An ADR Goal line naming a PROJECT.md goal must read `Goal: none — proved by …`.
- Main checkout may be on another session's branch: use a worktree, never switch it. Separate test DB per job.
- `nightly` on main failed 25 and 26 Nov. Never print child names; passwords/keys typed by Nimish only.
