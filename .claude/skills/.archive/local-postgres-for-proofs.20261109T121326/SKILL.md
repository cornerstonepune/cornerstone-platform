---
name: local-postgres-for-proofs
category: database
description: Use when a proof needs local Postgres or TEST_DATABASE_URL.
---

# Local Postgres for proofs: check it, restart it, never rebuild blindly

Run every database-backed proof against the throwaway local cluster, never production. After a session resume the server is usually stopped but its data directory survives, so check first, restart, then build a fresh database per proof from the base template.

1. Check with `pg_isready -h 127.0.0.1`. A refused connection means stopped, not lost.
2. Restart the server and recreate the run database as described in `references/restart-test-postgres.md`.
3. Apply the migration under test with `ON_ERROR_STOP=1`, then read back the seeded values before trusting any proof.
4. Export `TEST_DATABASE_URL` only for the one command that needs it, and always with the user in it: `postgresql://postgres:postgres@127.0.0.1:5432/<db>`. A bare `postgresql://127.0.0.1:5432/<db>` connects as the OS user (`root`) and fails with `role "root" does not exist`; a Playwright `webServer` that depends on the database then times out after 60 s and looks like a web failure.
5. Name the run database after the spec (for example `ui14_build`), never a generic name. Another session's proof-writer may already hold a database of the same name in the shared cluster.
6. A full fresh build (`bin/testdb fresh <url>`, with the database created first by `psql`) takes about 7 minutes; run it once per spec and reuse that database for the proofs.
