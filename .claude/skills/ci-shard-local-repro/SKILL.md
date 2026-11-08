---
name: ci-shard-local-repro
description: Use when CI shard or Playwright tests fail locally.
category: testing
---

# Reproduce CI shards on a fresh database

Run each browser shard locally on its own freshly created test database, in the order CI runs them, and judge a failure only on that run. A database that an earlier run has written to produces false failures: stale fixture rows, extra classes that make list queries time out, and collisions with a spec's own enrolment.

- Before blaming the code for a failure, rerun that spec alone on a fresh database, as the restricted login the site uses. If it passes there, the failure came from the database.
- A failure that appears only on a fresh database is real. Fix it in the spec's fixture or in the product, never by retrying until it passes.
- Do not disable triggers, drop tables or drop schemas on a shared test database to get a run through. Rebuild a fresh database instead. A hook that blocks a destructive command is a stop sign, not an obstacle to route around.
- Report each shard as passed and failed counts, and list the slow-database messages that are expected (for example, an outage test that locks a table on purpose) apart from any that are not.
