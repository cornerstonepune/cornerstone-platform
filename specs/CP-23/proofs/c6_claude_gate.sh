#!/usr/bin/env bash
# 6: `bin/check --claude` (the stop gate) runs the --db checks by itself when TEST_DATABASE_URL is set: it fails on
# the planted ownerless table, which no check without a database can see.
source specs/CP-23/proofs/lib.sh
start_pg
plant "$MIG/$(next_version)_cp23_plant_ownerless_table.sql" 'create table public.cp23_ownerless (note text);'
out=$(DATABASE_URL= TEST_DATABASE_URL="$PG_URL" bin/check --claude 2>&1); rc=$?
printf '%s\n' "$out" | tail -20
[ "$rc" -ne 0 ] || { echo "bin/check --claude passed with an ownerless table and TEST_DATABASE_URL set"; exit 1; }
[ "$(pg_connections)" -gt 1 ] || { echo "bin/check --claude never connected to TEST_DATABASE_URL's server"; exit 1; }
