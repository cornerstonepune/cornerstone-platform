# HANDOFF

_Overwritten at the end of every session. Keep under 30 lines. Facts only._

**Updated:** 2026-11-26 (short route chosen; context full after pushing fee22baf3) · **By:** coordinator (loop run, Opus) · **Model:** claude-opus-5-5
**Milestone:** M7 — G1–G4 profile groups (ADR 0115, 0117) · **Branch:** plan/profile-tickets (PR #956)

## State
- Nimish chose the SHORT ROUTE (ADR 0117, supersedes ADR 0116's seven tickets): one skill→group list he approves in
  chat, seeded into `skill_profile_group`; readers use view `objective_profile_group`; one count command
  `engine curriculum profile-check`. No S27/S35 redraw, no approval screen.
- PR #956 carries ADR 0116 (marked superseded), ADR 0117, PROJECT.md M7 G7.1–G7.4, `tests/profile_rows.py` (proven), and
  the gold "okay to all" commit from #954 (cherry-picked; #954 closed as folded in).
- profile_rows.py: `a_staff` runs `internal.people_vocabulary` before a grant; `scope_to_test_band` adds band T9 so seeded
  G1–G4 rows don't count in tests. Run tests with TEST_DATABASE_URL=…54329/pg_profile (`postgres` lacks ADR 0115).

## Tests
- tests/test_promises.py passes locally (5 passed) after the ADR 0117 goal-line fix; full bin/check not re-run; CI on #956 pending.

## Next step
0. CI green on #956 → `gh pr merge 956`; then `gh pr close 954 -c "folded into #956"`. Facts for step 1: side-session-notes/local_6d8eb21c…/short-route-handover.md + skills_g14_seed.json.
1. Draft one group per registry skill used by G1–G4 objectives (seed registry.json + live, ~125 skills), keep the 32 gold
   choices, publish a readable page; Nimish approves in chat (record his words in the commit).
2. One ticket (seed + test on `plan/t<N>`): approved list → `skill_profile_group`; chain_picture.py and objective-chain.ts
   read `objective_profile_group`; `engine curriculum profile-check` per grade. Builder → CI → reviewer → merge.
3. Run profile-check on pg_profile with the seeds; quote counts; kind > 0. Then loop-release on Nimish's go.

## Needs Nimish
- Approve the skill→group list in chat. Go for release. Later (only for future changes): `engine staff grant <email> profile_approver`.

## Don't repeat
- Don't touch plan/k1-pilot-offers. Use a worktree, never switch the main checkout. Next free ADR: 0118.
- Use database `pg_profile` on 54329, not `postgres`.
