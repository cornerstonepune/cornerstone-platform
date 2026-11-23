# 0104: db/schema.sql is dumped from the migrations, never written by hand

Date: 2026-11-23. Status: accepted (loop adoption).
Goal: none — the goal loop is retired; this is part of adopting the loop.

## Decision
The loop's `db/schema.sql` is a structure-only `pg_dump` (schemas `public` and `pii`, no owners, no grants, no rows) of a
database built from this repository alone with `bin/testdb fresh` on Postgres 17, the version CI uses. Today: 87 tables
from 183 migrations. `supabase/migrations/` stays the only way the schema changes; after a migration, regenerate:

    docker exec cornerstone-loop-pg pg_dump -U postgres --schema-only --no-owner --no-privileges --schema=public --schema=pii postgres > db/schema.sql

## Rejected
- Writing the schema from memory or from `docs/data-model.md`: it drifts, and the migrations are the truth.
- Dumping the Supabase container on port 54322: it holds an older assessment-engine schema and a copy of live rows.
