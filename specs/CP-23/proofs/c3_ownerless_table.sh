#!/usr/bin/env bash
# 3: with TEST_DATABASE_URL set to an empty local database, `bin/check --db` builds the schema from every migration
# and fails on a table with no owner row. The plant is a migration after every other, making a table with no
# access_table row and no constraint (so no rules.json drift names it): only apply_conventions() can catch it.
source specs/CP-23/proofs/lib.sh
start_pg
plant "$MIG/$(next_version)_cp23_plant_ownerless_table.sql" 'create table public.cp23_ownerless (note text);'
out=$(DATABASE_URL= TEST_DATABASE_URL="$PG_URL" bin/check --db 2>&1); rc=$?
printf '%s\n' "$out" | tail -40
[ "$rc" -ne 0 ] || { echo "bin/check --db passed with a table that has no owner"; exit 1; }
printf '%s\n' "$out" | grep -q 'cp23_ownerless' || { echo "bin/check --db failed, but never named the ownerless table"; exit 1; }
