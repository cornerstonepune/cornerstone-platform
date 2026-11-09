#!/usr/bin/env bash
# 7: bin/check without --db uses no database and finishes in under 60 s. A throwaway Postgres logs every connection
# it receives; libpq's defaults (PGHOST, PGPORT) point at it, DATABASE_URL and TEST_DATABASE_URL are empty. This is
# also the clean run that proves "it passes on main" for criteria 1 and 2.
source specs/CP-23/proofs/lib.sh
start_pg
before=$(pg_connections)
start=$(date +%s)
out=$(DATABASE_URL= TEST_DATABASE_URL= PGHOST=$PG_HOST PGPORT=$PG_PORT PGUSER=postgres PGDATABASE=cp23_empty bin/check 2>&1); rc=$?
took=$(($(date +%s) - start))
printf '%s\n' "$out" | tail -30
echo "bin/check exit $rc in ${took}s; connections received: $(($(pg_connections) - before))"
[ "$rc" -eq 0 ] || { echo "bin/check failed on a clean tree"; exit 1; }
[ "$took" -lt 60 ] || { echo "bin/check took ${took}s (limit 60)"; exit 1; }
[ "$(pg_connections)" -eq "$before" ] || { echo "bin/check without --db connected to a database"; exit 1; }
