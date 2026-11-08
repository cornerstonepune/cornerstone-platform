FAIL - CP-2 independent verification, second pass, 2026-11-08, branch cp-2-build against origin/main

Verdict of the athena-verifier (separate read-only agent); the builder copied it here and added the last section.
`athena done CP-2`: proofs 1, 2, 3 and 5 pass; proofs 4 and 6 are box-only and were not run.

1. Decision recorded then amended with the real-pooler result: NOT MET, waiting on the box (ADR 0100 says "NOT YET RUN").
2. public.current_staff(): MET.
3. Identity set in one place, only from the verified cookie: MET (rawSql allow-list test now exists).
4. Real shared connection (one connection, x200, concurrent, after error, after timeout): NOT MET, waiting on the box. The
   harness now forces one connection, fails unless A, B and nobody were served by one backend, and reads the setting directly
   so it can run on the live pooler before the migration is deployed.
5. Existing browser and speed suites: UNCLEAR until CI's browser job is green (signed-in queries are now 4 round trips).
6. No rule switched on: MET from the code; live check waits on the box and the deployed migration.
Unasked work: DB_POOL_MAX override, bin/check-pooler wrapper, uuid-shape test (all minor, all serve item 4).
Wrapper: safe (reads DATABASE_URL from .env, never prints it; read-only).
Risk named: check requires one backend for the whole run; Supavisor transaction mode may not promise that, so if the box run
fails on that line, read the backend ids before calling it a leak.
Risk named: the sql proxy ran a query twice when awaited through .catch/.finally/.execute (two inserts for a write).

Builder's follow-up after this verdict (not re-verified): the double execution was real (reproduced: 8 rows where 5 expected).
Fixed at the cause in apps/web/lib/db.ts (replaces postgres.js's single `handle` door, marks the query executed before the
first await, keeps .values()/.raw()/.forEach, refuses cursor()/describe()). New check apps/web/scripts/check-identity-once.ts
(each query runs once; needs TEST_DATABASE_URL) is run by packages/engine/tests/test_web_identity.py where the website's
packages exist. Passes locally on a throwaway Postgres.

STILL OPEN, cannot be closed from the sandbox: run bin/check-pooler on the box (docs/notes/CP-2.md has the lines), amend
ADR 0100 with the result, deploy the migration for proof 6, CI browser/speed green, then re-run the verifier.
