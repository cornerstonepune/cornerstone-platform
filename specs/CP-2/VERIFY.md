FAIL - CP-2 independent verification, 2026-11-08, branch cp-2-build against origin/main

Verdict of the athena-verifier (a separate read-only agent; the builder copied its report here, it did not edit the verdict).
`athena done CP-2`: proofs 1, 2, 3 and 5 pass; proofs 4 and 6 are box-only and were not run.

1. Decision recorded then amended with the real-connection result: NOT MET. ADR 0100 says "On the real pooler: NOT YET RUN".
2. public.current_staff(): MET.
3. Identity from the verified cookie, set in one place: MET.
4. Real shared connection, A/B/nobody x200, concurrent, after error and timeout: NOT MET (not run on the real pooler).
   The verifier also found the test did not force one connection or fail when none was shared.
5. Existing browser and speed suites: UNCLEAR until CI's browser job is green (a signed-in query is now 4 round trips).
6. No rule switched on: UNCLEAR (box-only); the diff adds no policy.
Unasked work: none. Missing: the rawSql allow-list test, a uuid shape test, a max:1 shared-backend assertion.

Builder's follow-up after this verdict (not re-verified): added the rawSql allow-list test and a uuid-shape test
(packages/engine/tests/test_web_identity.py); check-pooler.ts now runs at one connection (DB_POOL_MAX=1) and fails unless A,
B and nobody were served by the same backend (passes on a direct local Postgres, one shared backend).

STILL OPEN, cannot be closed from the sandbox: run `CHECK_POOLER_URL=... node scripts/check-pooler.ts` on the box against
Supabase's pooler and amend ADR 0100 with the result (items 1, 4); box proof 6 after deploy; CI browser/speed jobs green (item 5).
Do not merge until those are done; this file must be re-run by the verifier after them.
