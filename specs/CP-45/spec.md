# CP-45: CI's Postgres is pinned, so a new minor cannot slow every run

**What.** `bin/ci-postgres` installed `postgresql-17` unpinned. When 17.12 replaced 17.11 in the PostgreSQL repository (2026-11-12) the paper screen's speed test (p6, budget 2500 ms) went from 0.4-1.3 s to 2.1-3.8 s on the same code and failed main. Run on the same commit with 17.11 installed it took 386 ms. Pin the install to 17.11 (still in the repository) so the test environment changes only when we change it.

**Done when.**
1. `bin/ci-postgres` installs exactly `postgresql-17` and `postgresql-client-17` 17.11 and prints the version it started (already printed by the script).
2. On this PR's full run the browser job prints `PostgreSQL 17.11` and p6's "open the paper screen" is under its 2500 ms budget.

**Out of scope.** Finding why 17.12 is slow on that screen (a separate piece); changing the budget (never); live runs Postgres 17.6 on Supabase.
