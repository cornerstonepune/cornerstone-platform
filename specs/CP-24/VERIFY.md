VERDICT: PASS
# CP-24 independent verification (PR #514, 8d5cde36 against main af315e07)
Read-only review by the athena-verifier. Ran without a database: test_one_clock (3 text tests), test_layout (9), locked proofs test_one_clock/test_routes/test_docs (10): pass. Database proofs and web specs were not run by the verifier; they rely on RUN.json (12 of 12 at 08:48Z).
1. One clock: MET. Every site listed at the first check now reads the school's setting; the guard scan over 584 files finds nothing; the guard finds 19 hits on main, so it would fail on a reintroduced site. Explicit-UTC leftovers are not school dates.
2. A move at 01:00 IST is dated that day: MET.
3. One keyed route per action: MET (five routes, in engine-routes.ts, proofs 3a-3e pass).
4. Live watch reports out-of-order step settings: MET (item reworded with Nimish's unlock; locked files otherwise byte-identical; LOCK digest matches).
5. Live watch reports a stale nightly run: MET for the test; the LIVE read is box-only and pending.
6. docs/backup.md: PENDING Nimish's two numbers (Point-in-Time days; Lightsail snapshot retention). The file says plainly 'not known, Nimish to read'. The restore drill (165 tables, 100,418 rows, counts equal) and the 48-hour promise are present.
7. Rule in docs/backend-plan.md: MET.
No test weakened. Specs CP-1/CP-6/CP-7 are identical to main. Nothing unasked of substance. Follow-ups (not in this scope): dates of past events still taken from the server's date (created_at::date in queries-results.ts, queries-check-groups.ts, feedback page); the new zone SQL is not filtered by school.
VERDICT: PASS
