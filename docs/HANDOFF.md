# Handoff: where things stand
Under 50 lines. Written by orchestrator 3, 8 Nov 2026 (~11 PM IST). Verify every fact before acting. Times to Nimish: IST, never UTC.

## Done (main, all 8 Nov)
CP-0 plan; CP-1 people (live; box proofs pass: staff 7=7, K2-A rolls 1-22); CP-2 who-is-asking (live; pooler repeat passed);
CP-5 hygiene; CP-20 test DB in CI; CP-13 min adults (#479, live); plan split #494 (CP-11 draft / CP-21 goes live / CP-12 by hand).

## Open: CP-3 #477 (build session_01KEBF27howCR1C6e5zKKBP6), the chain's bottleneck
- Speed bug FIXED (class_band reads as owner; staff.signin_id key; migration 20270120100000): browser shard 1 green in CI.
- Shards 2/3 red: old specs invent educators with only a class label (no school_class, enrolment, staff row, grant). Nimish chose
  option A (honest rows via one central apps/web/tests/access-fixture.sql, K2-A shape) and typed UNLOCK CP-3; label `scope-change` is on #477.
  Session decisions: no uploader-sees-own exception; counts-only definer fn only for sites it proves broken (6 call sites listed, 1 proven);
  item 7 reworded and relocked. Merge when: all CI shards green + verifier re-PASS on the final diff (athena-verifier agent).
- Then tell CP-9 session "CP-3 merged" and start the CP-4 build (below).

## Next after CP-3
- CP-4 #452 (locked; design session_01KEBF2A7DQSEjwZyyUgaLRE): fresh branch from main, recipe below. Then CP-6, CP-8, CP-9, CP-11.
- CP-9 #478 draft (session_01KEBF28jjY9zjqqD8bexQeL): waits for CP-3; data-register entries done; then browser preflight, ready, verifier.
- CP-6 session_01KEBF2ATKNsoYRi1UU1QL8b, CP-8 session_01KEBF27vass2Hk5iXWoehr3: scoped and locked, wait for CP-4.
- Eight scopes LOCKED by Nimish on the PRs (not the issues): CP-7 #488 (proofs locked), CP-11 #486 (locked), CP-18 #490 (locked), CP-12 #485,
  CP-14 #483, CP-17 #492, CP-19 #489, CP-21 #495 (issues #487 #459 #466 #460 #482 #491 #467 #496). Each scope session writes proofs and runs
  athena lock; sessions: CP-7 ...tTQkRZserHHBXBJd, CP-11 ...294xSdNbUzu5W38YiQ, CP-12+21 ...28neuwnS7mNrCzQcqU, CP-14 ...28EPCNCPen2s3LvKjT,
  CP-17 ...28cQGxXK59RxjQTEWt, CP-18 ...29tBLA6f9MBovGRhf3, CP-19 ...27Y8mGj8Gq8KxdnPAC (all prefixed session_01KEBF). Order CP-11, CP-21, CP-12.
- CP-18's proofs guess CP-17's `materials_approval.approve` and CP-6's `fortnight_cycle.step/state`: build those with exactly those names.
- Not scoped: CP-10 (Sarvam letter), CP-15/16 (page format; frontend). Old duplicate issues closed (#455 #462 #465 #484).

## Nimish's rules (his words, 8 Nov)
- Merge: "Once we know that it's safe to merge, you should merge... take some judgment call." Needs verifier PASS on final code + real tests green.
- The FORTNIGHT is the unit; week/day/quarter are derived views. Values are settings rows. Coordinator unrestricted for now.
- No questions on values; ask only what changes what the school sees or is unsafe. Short plain answers; challenge him; say when unsure.

## Lessons (hours lost)
- A DRAFT PR skips most CI (its green is empty). BUILD RECIPE: guard tests; browser specs the change touches run LOCALLY as app_web on an
  accumulated DB in CI order; check each failure against main; numbers in the PR; mark READY only then; CI once. Never stack on an unmerged branch.
- 'cancelled' roll-up jobs (engine/browser) show red when a newer push cancelled the run: not a failure. Cancel a doomed run at once.
- Jev hook: read the tripwire id from the denial, run Bash `true # jev:intended <id>: "<his real sentence>"`, repeat. Sessions cannot pass it
  for issue/PR writes: the orchestrator does those. Locked proofs that guard another scope need his UNLOCK typed alone in that session.
- Local checkout is stale: read main from GitHub. Do not commit .claude/autoharness or plugin skills (the stop hook nags: ignore).

## Waiting on Nimish (none blocks a merge)
Restricted-login password + switch-on gate (after CP-3); CP-9 box steps (n8n flow f4, cp9.real_notes_from, 20 notes, 5 hand checks);
CP-13 item 4 list; the Athena request (local preflight gate) he was given to paste.
