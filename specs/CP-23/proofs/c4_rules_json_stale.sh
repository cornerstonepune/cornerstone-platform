#!/usr/bin/env bash
# 4: in the same setup, `bin/check --db` regenerates rules.json and fails when the committed file differs, printing
# "run `engine live rules --write`". The plant is the real mistake: a migration that adds a rule while rules.json is
# left as it was. rules.json is restored on exit whatever bin/check does to it.
source specs/CP-23/proofs/lib.sh
start_pg
cp packages/engine/engine/checks/rules.json "$WORK/rules.json.bak"
plant "$MIG/$(next_version)_cp23_plant_new_rule.sql" \
  'alter table public.academic_year add constraint cp23_plant_check check (label <> '"'cp23'"');'
out=$(DATABASE_URL= TEST_DATABASE_URL="$PG_URL" bin/check --db 2>&1); rc=$?
printf '%s\n' "$out" | tail -40
[ "$rc" -ne 0 ] || { echo "bin/check --db passed although rules.json lacks a rule a migration makes"; exit 1; }
printf '%s\n' "$out" | grep -qF 'run `engine live rules --write`' ||
  { echo 'bin/check --db failed, but did not print: run `engine live rules --write`'; exit 1; }
