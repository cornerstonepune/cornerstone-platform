#!/usr/bin/env bash
# 1: with no database, bin/check fails on a grade code in a .py outside assess/ and on a screen that says "borrow".
# Both plants go in at once (one ~25 s run); the output must name each one, so each guard is seen to catch its own.
# "It passes on main" is the clean run of proof 7 (same command, same empty database variables).
source specs/CP-23/proofs/lib.sh
plant packages/engine/engine/core/cp23_plant.py 'PLANTED_GRADE = "K2"'
plant apps/web/app/cp23-plant/page.tsx 'export default function Page() {
  return <p>Borrow one ten from the tens column.</p>;
}'
out=$(DATABASE_URL= TEST_DATABASE_URL= bin/check 2>&1); rc=$?
printf '%s\n' "$out" | tail -40
[ "$rc" -ne 0 ] || { echo "bin/check passed with both plants in"; exit 1; }
printf '%s\n' "$out" | grep -q 'K2' || { echo "bin/check failed, but never named the planted grade code K2"; exit 1; }
printf '%s\n' "$out" | grep -qi 'borrow' || { echo "bin/check failed, but never named the screen that says borrow"; exit 1; }
