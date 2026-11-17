# CP-54: a fast lane for data changes (17 Nov 2026)

A pull request that changes only `supabase/seed/**`, `DECISIONS-LOG.md` or `CLAUDE.md` (plus the documents already on the quick list) no longer
runs the twelve engine shards or the browser. It runs `bin/check` and one runner: `bin/testdb schema` (schema and seed, no question bank) and
the tests in `SEED_TESTS` (`bin/ci-plan`). Measured here: database 17 s, tests 244 in 28 s; on CI about 3 minutes with the installs.

- Not in the lane: other files under `docs/` that a test reads (`docs/ux-rules.md`, `docs/design`, `docs/crosswalk`…): they still run everything.
- The risk taken: 91 test files read the seed; the lane runs ten. A seed row another test depends on is found by the full run on main after the
  merge (the website lane works the same way). A draft is unchanged; main, the nightly run and a run by hand still run everything.
- Proof: `tests/test_ci_plan_seed.py`.
