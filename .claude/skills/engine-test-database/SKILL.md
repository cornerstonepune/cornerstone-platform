---
name: engine-test-database
category: testing
description: Use when running engine tests or athena done on Postgres.
---

# Run engine tests and proofs on a fresh migrated Postgres

Every engine test run or `athena done <ID>` gets a fresh database built from the migrations, named in `TEST_DATABASE_URL`, with `LC_ALL=C.UTF-8` set in the same command: `export TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/<fresh-db> LC_ALL=C.UTF-8`.

- A full engine suite runs in shards, each shard on its own fresh database. Report the per-shard counts and the total; one shard's failures are the branch's failures, even if the shard's files are untouched by you.
- Name the Postgres version you tested on in any report (the local run may be 16 while CI uses 17).
- `athena done <ID>` rewrites `specs/<ID>/RUN.json`. Before committing a fix, check `git status --short` and restore run records your change did not mean to update.
- Keep reads (`cat`, `python3 specs/<ID>/proofs/...`) in separate Bash calls from mutations (`sed -i`, redirects) on the same line; the guard refuses a command that names a locked spec's proofs and also mutates.
