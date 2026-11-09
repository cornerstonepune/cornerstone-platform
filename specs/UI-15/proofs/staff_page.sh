#!/usr/bin/env bash
# UI-15 proof 2: the existing specs for the staff page pass, and a coordinator can still add a person, set classes and
# set subjects (ui15.spec.ts, the tests named "a coordinator can still").
# - u53-staff-and-school.spec.ts is unchanged against main and passes.
# - gate-password.spec.ts may differ from main by one change only: the person its "new member of staff added on the
#   Staff page" test signs in is made a coordinator (plus the athena-journey import any changed spec carries). Every
#   added or removed line must be about that (staffMember, role, "coordinator", athena-journey), and few lines change.
#   That test, found by its title, passes.
# Usage: staff_page.sh                     the proof
#        staff_page.sh --diff-only FILE    only the allowance, judging FILE as gate-password.spec.ts (self-check)
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../../.." && pwd)
base=$(git -C "$root" merge-base origin/main HEAD) || exit 1

allowed() {  # $1: the file to judge as apps/web/tests/gate-password.spec.ts
  [ -f "$1" ] || { echo "gate-password.spec.ts is gone"; return 1; }
  # diff exits 1 on any difference; only python's verdict counts
  { git -C "$root" show "$base:apps/web/tests/gate-password.spec.ts" | diff -U0 - "$1" || true; } | python3 -c '
import re, sys
lines = [l for l in sys.stdin.read().splitlines() if l[:1] in "+-" and not l.startswith(("+++", "---"))]
bad = [l for l in lines if l[1:].strip() and not re.search(r"staffMember|\brole\b|coordinator|athena-journey", l[1:])]
for l in bad:
    print(f"gate-password.spec.ts changed beyond making the Staff-page test sign in a coordinator: {l}")
if len(lines) > 12:
    print(f"gate-password.spec.ts: {len(lines)} lines changed, more than that one change needs (12)"); bad.append(1)
sys.exit(1 if bad else 0)'
}

if [ "${1:-}" = --diff-only ]; then allowed "$2"; exit; fi

git -C "$root" diff --quiet "$base" -- apps/web/tests/u53-staff-and-school.spec.ts \
  || { echo "u53-staff-and-school.spec.ts was changed"; exit 1; }
allowed "$root/apps/web/tests/gate-password.spec.ts" || exit 1
out=$(bash "$here/browser.sh" tests/u53-staff-and-school.spec.ts tests/gate-password.spec.ts \
  -g "School|Staff page|a class no child is in" 2>&1) || { echo "$out"; exit 1; }
echo "$out"
# the title search found u53's three tests and gate-password's Staff-page test, and all four passed
grep -qE "✓.*gate-password\.spec\.ts.*new member of staff" <<<"$out" && grep -qE "^ *4 passed" <<<"$out" \
  || { echo "u53's three tests and gate-password's Staff-page test did not all run and pass"; exit 1; }
bash "$here/browser.sh" --config "$here/playwright.config.ts" -g "a coordinator can still"
