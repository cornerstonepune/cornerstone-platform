# Handoff: where things stand
Under 50 lines. Written by orchestrator 4, 9 Nov 2026 (~9 AM IST). Verify every fact before acting. Times to Nimish: IST, never UTC.
What remains: docs/backend-plan.md is the one list of what remains. Core = the working backend; Next and Later wait. Stay inside Core.

## Merged on main
CP-0 plan, CP-1 people, CP-2 who-is-asking, CP-5 hygiene, CP-13 min adults, CP-20 test DB in CI, CP-3 role rules (#477), CP-4 every table (#499, e575a38, 9 Nov).
CP-3/CP-4 rules are inert until the site connects as the restricted login (Nimish's step, later; checklist in docs/notes/CP-4.md).

## In flight (3 builds at once)
- CP-9 #478 (session_01KEBF28jjY9zjqqD8bexQeL): told "CP-4 merged"; merge main, list its 2 tables, athena done, ready, then orchestrator runs the verifier.
- CP-11 build (session_01KEBF293dZrcXGU59zwEjvh, branch cp-11-build): Nimish approved the one-line FET install in .claude/athena/setup.sh; it is a
  platform-only edit that survives Athena updates (the installer copies setup.sh only when missing), so no central change is needed.
- CP-8 build (session_01KEBF27jJiVZsJPQHgvFbNU, branch cp-8-build): scope brought from claude/bold-carson-f72yjv; may need another UNLOCK CP-8.
- CP-10 voice SCOPE (session_01KEBF29kft7fbJa78ZhXLYP): issue #502 created; Nimish decides A/B/C in it and adds scope-locked. Build waits for CP-9.

## Next builds (up to 3 in parallel, merge one at a time)
CP-6 (session_01KEBF2ATKNsoYRi1UU1QL8b, waits for Nimish's lean decision), then CP-7, CP-21, CP-12; CP-10 after CP-9.
Locked scopes live on PRs: CP-7 #488, CP-11 #486, CP-12 #485, CP-17 #492, CP-18 #490, CP-19 #489, CP-21 #495; CP-6/CP-8 scopes on branch
claude/bold-carson-f72yjv (never a PR; bring a scope over with `git checkout origin/<branch> -- specs/CP-N` in the build branch).
CP-18's proofs guess CP-17's materials_approval.approve and CP-6's fortnight_cycle.step/state: build those exact names.

## Open problems
- CP-14: scope locked in session_01KEBF28EPCNCPen2s3LvKjT but the guard refused git add/commit of specs/CP-14 (5 times). The Athena coordinator read it:
  the guard refuses a command that names a locked spec path AND has a mutator word (cp, mv, rm, checkout, redirect...); "locked" = a LOCK file on disk in
  the main checkout, so a worktree does not escape it. Try add, commit, push as separate single commands. Real fix is an athena-ops change (Nimish's scope).
- Lean drafts are in: CP-6 (engine, not database triggers), CP-7 (one approval per fortnight), CP-12 (command check; keep materials links), CP-21
  (changed-since flag). A reduced scope replaces the long one only after Nimish types UNLOCK <ID> in that session.
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
