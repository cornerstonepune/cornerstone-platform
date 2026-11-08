---
name: postgres-pooled-query-context
category: database
description: Use when a postgres.js query needs set_config identity.
---

# Per-request identity over a transaction pooler

Put the identity setting inside one transaction on one reserved connection: begin, then `select set_config('app.staff_id', $1, true)` (transaction-local), then the query, then commit (rollback on error), then release. The transaction-local form ends with the commit, so it cannot reach the next request on that backend. Never set it on a bare statement.

A query object that runs on `.then` must execute exactly once, however it is awaited. A wrapper that also hooks `.catch`, `.finally` or `.execute` must mark the query executed before its first await. Otherwise a write runs twice: one reproduction wrote 8 rows where 5 were expected.

Prove it with a check that awaits each query through each entry point and counts the rows written, then a pooler run that alternates identities across at least 200 requests and checks that every request saw only its own identity. Keep a read-back function that returns null when no identity is set.

Pooler decision and reasons: `docs/adr/0100-a-request-says-who-is-asking-in-one-transaction-per-query.md`.
