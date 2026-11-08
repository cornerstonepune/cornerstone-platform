# Handoff: where things stand
Under 50 lines. Rewritten at the end of every session; the session-start hook shows the top lines.

## Live
- Main is green. Live database had all 130 migrations at the 8 Nov reconciliation. PR #413 (FET install) was merged by
  Nimish on 8 Nov; CP-11 proves it after the fact.
- Athena 2.13.0. `athena health` 8 Nov: Canny PASS. Still FAIL: usage ledger never written, plan usage not recorded,
  many components "never fired" (they fire as scopes run).

## Start here
- `docs/backend-plan.md` is the one list of what remains: CP-1..CP-19. No status in it; status is `athena status`,
  `specs/<ID>/`, the issues' labels and the nightly run. Backend done = all 19 finished + LIVE proofs pass.
- Issues: CP-1 #448, CP-2 #449, CP-0 #450, CP-3 #451, CP-4 #452, CP-5 #453, CP-6 #454, CP-7 #455, CP-8 #456,
  CP-9 #457, CP-10 #458, CP-11 #459, CP-12 #460, CP-13 #461, CP-14 #462, CP-15 #463, CP-16 #464, CP-17 #465,
  CP-18 #466, CP-19 #467.
- Locked by Nimish 8 Nov: CP-0, CP-1, CP-2, CP-5, all with locked proofs. CP-0 MERGED (PR #468).
- CP-5 is being built in its own session (session_01KEBF29SJ64px524jd4PQyT, tag cp-5): branch cp-5-database-hygiene,
  draft PR with Closes #453. CP-1 and CP-2 wait (one migration scope at a time). This branch (claude/bold-carson-f72yjv)
  is a working branch only: never open a PR from it; each scope ships from a clean branch off main.
- Never commit .claude/autoharness/ or plugin-written .claude/skills/* on a PR branch: CI rejects them.
- Merging: Athena lets the orchestrator merge when CI is green, VERIFY.md says PASS and the PR is mergeable; the Jev hook
  needs Nimish's words in recent messages for a merge, and Nimish said (8 Nov) the orchestrator should merge by itself.
- Test databases: Nimish chose (8 Nov) a throwaway local copy for write tests, live checks read-only on the box, and NO
  test database in GitHub's proofs job. CP-1's database proofs will be red in that job: needs his UNLOCK to re-mark them.

## Decisions taken (Nimish, 8 Nov)
- Load all 7 staff (CP-1). Scrub the project reference from STATE.md (CP-5). Leaked-password protection: recorded
  "not applicable" (CP-5). Access: coordinator, deputy, mentor, head, curriculum team, ops see everything; educators
  and assistants see their own classes and subjects; everyone sees question bank, curriculum, plan, timetable.

## Findings that changed scopes
- CP-1: `import_staff` already exists; edit-history triggers do NOT cover activity inserts or link updates (real gap).
- CP-2: proves identity transport only; function lives in `public`; real-pooler proof is box-only.
- CP-5: 35-function list must be read from the live database; reference sits in 3 tracked files.

## Next
- CP-1 proofs, then lock; build CP-0 PR, then CP-1, CP-2, CP-5 (one migration scope at a time).
- CP-3/CP-4: draft from the simplified access model; design reviews not started. CP-3 design reviews 6-19: not started.
- Not drafted: three layouts of one activity page, Sarvam "no retention" request text, bars decision text.
- Access grid page (13 roles) is superseded by the simplified model above; republish with CP-3.

## Blocked (decisions needed from Nimish)
1. Named signer for the live staff import (CP-1); a class for any class-scoped role.
2. Lock the next wave: CP-3 and CP-4 once drafted.
