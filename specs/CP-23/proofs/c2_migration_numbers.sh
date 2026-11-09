#!/usr/bin/env bash
# 2: bin/check fails on a migration the branch adds (untracked, so not on origin/main) numbered at or before
# origin/main's newest, and on two migrations that share a version. Both plants in one run; the output must name each.
# "It passes on main" is the clean run of proof 7.
source specs/CP-23/proofs/lib.sh
git rev-parse -q --verify origin/main >/dev/null || { echo "proof error: origin/main is not fetched"; exit 99; }
main_newest=$(git ls-tree --name-only origin/main "$MIG/" | sed 's#.*/##' | grep -E '^[0-9]{14}_' | cut -c1-14 | sort | tail -1)
old=$((main_newest - 1))   # one second before main's newest: unique, but sorts before it
ls "$MIG" | grep -q "^${old}_" && { echo "proof error: $old is taken"; exit 99; }
dup=$(next_version)
plant "$MIG/${old}_cp23_plant_older_than_main.sql" 'select 1;'
plant "$MIG/${dup}_cp23_plant_dup_a.sql" 'select 1;'
plant "$MIG/${dup}_cp23_plant_dup_b.sql" 'select 1;'
out=$(DATABASE_URL= TEST_DATABASE_URL= bin/check 2>&1); rc=$?
printf '%s\n' "$out" | tail -40
[ "$rc" -ne 0 ] || { echo "bin/check passed with a migration older than main's newest and a shared version"; exit 1; }
printf '%s\n' "$out" | grep -q "${old}_cp23_plant_older_than_main" ||
  { echo "bin/check never named the migration numbered before main's newest ($main_newest)"; exit 1; }
for f in cp23_plant_dup_a cp23_plant_dup_b; do
  printf '%s\n' "$out" | grep -q "$f" || { echo "bin/check never named $f, one of two migrations sharing version $dup"; exit 1; }
done
