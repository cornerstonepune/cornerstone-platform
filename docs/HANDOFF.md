# Handoff: where things stand
Under 50 lines. Written by orchestrator 4, 9 Nov 2026 (~9 AM IST). Verify every fact before acting. Times to Nimish: IST, never UTC.
What remains: docs/backend-plan.md is the one list of what remains. Core = the working backend; Next and Later wait. Stay inside Core.

## Merged on main
CP-0 plan, CP-1 people, CP-2 who-is-asking, CP-5 hygiene, CP-13 min adults, CP-20 test DB in CI, CP-3 role rules (#477, 750ec6f, 8 Nov).
CP-3 rules are inert until the site connects as the restricted login (Nimish's step, later; checklist in docs/notes/CP-4.md).

## In flight
- CP-4 #499 (build session_01KEBF293mzWweq8uTdBQShv): 3 verifier rounds, last = PASS (3b5e48f), VERIFY.md pushed (5b47f4c). Full CI was running.
  Merge when proofs + browser + engine shards are green. Then tell CP-9 session_01KEBF28jjY9zjqqD8bexQeL "CP-4 merged".
- CP-9 #478 draft: parked for CP-4 (its proof needs access_table.data_class). Then merge main, list its 2 tables, athena done, ready, verifier.
- CP-11 build (session_01KEBF293dZrcXGU59zwEjvh, branch cp-11-build): Nimish approved the one-line FET install in .claude/athena/setup.sh.
  Same line must later go into the central Athena setup. Orchestrator then runs the athena-verifier.
- CP-10 voice SCOPE (session_01KEBF29kft7fbJa78ZhXLYP): drafting What/Done when/Out of scope; orchestrator creates the issue, Nimish adds scope-locked.

## Next builds (up to 3 in parallel, merge one at a time), after CP-4 merges
CP-9, CP-6 (session_01KEBF2ATKNsoYRi1UU1QL8b), CP-8 (session_01KEBF27vass2Hk5iXWoehr3); then CP-7, CP-21, CP-12; CP-10 after CP-9.
Locked scopes live on PRs: CP-7 #488, CP-11 #486, CP-12 #485, CP-17 #492, CP-18 #490, CP-19 #489, CP-21 #495; CP-6/CP-8 scopes on branch
claude/bold-carson-f72yjv (never a PR; bring a scope over with `git checkout origin/<branch> -- specs/CP-N` in the build branch).
CP-18's proofs guess CP-17's materials_approval.approve and CP-6's fortnight_cycle.step/state: build those exact names.

## Open problems
- CP-14: scope locked in session_01KEBF28EPCNCPen2s3LvKjT but the guard refuses git add/commit of specs/CP-14 (5 times, even from a worktree).
  Asked the Athena coordinator (session_01KEBF27Vu5BSQK2Xrmx3XY4) to find why. Do not work around the guard.
- Lean drafts requested from the CP-6, CP-7, CP-12/21 scope sessions; a reduced scope replaces the long one only after Nimish types UNLOCK <ID>.
- Latent: CP-0's locked proof 2 expects exactly CP-1..CP-19 in the plan table, but the table also has CP-21 (since #494): CP-0 fails when re-run.
  Needs Nimish's UNLOCK CP-0 to change the expected list. CP-0 proof 4 (this file points to the plan) is fixed by line 3 above.

## Nimish's rules (his words)
- Merge: "Once we know that it's safe to merge, you should merge... take some judgment call." Needs verifier PASS on final code + real tests green.
- 9 Nov: "access rules are not a gate anymore"; "voice is the most critical part", do not wait for the Sarvam letter; keep it lean.
- The FORTNIGHT is the unit. Values are settings rows. Ask only what changes what the school sees or is unsafe. Short plain answers; challenge him.

## Lessons (hours lost)
- A DRAFT PR skips most CI. Build recipe: guard tests; browser specs run LOCALLY as app_web, each shard on a fresh DB in CI order; check failures
  against main; numbers in the PR; READY only then; CI once. Never stack on an unmerged branch. 'cancelled' roll-up jobs showing red are noise.
- The harness reads a verdict only from a line starting `VERDICT: PASS` in VERIFY.md. Test test_curriculum_versions failed before 9 Nov UTC (date).
- Jev hook blocks issue/PR writes by child sessions; the orchestrator does them. The guard blocks any command text naming a locked specs/ path.
- Local checkout is stale: read main from GitHub. Do not commit .claude/autoharness or plugin skills (the stop hook nags: ignore).

## Waiting on Nimish (none blocks a merge)
CP-9 box steps (n8n flow f4, cp9.real_notes_from, 20 notes, 5 hand checks); CP-13 item 4 list; the Athena preflight request; restricted-login switch later.
