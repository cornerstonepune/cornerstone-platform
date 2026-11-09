#!/usr/bin/env bash
# UI-15 proof 2: the existing specs for the staff page are unchanged against main and pass, and a coordinator can still
# add a person, set classes and set subjects (ui15.spec.ts, the tests named "a coordinator can still").
# The existing specs that use the staff page's actions: u53 (set classes, as the suite's coordinator) and gate-password
# (adds a member of staff on the Staff page).
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../../.." && pwd)
specs=(tests/u53-staff-and-school.spec.ts tests/gate-password.spec.ts)
git -C "$root/apps/web" diff --quiet "$(git -C "$root" merge-base origin/main HEAD)" -- "${specs[@]}" \
  || { echo "an existing staff-page spec was changed: ${specs[*]}"; exit 1; }
# gate-password.spec.ts:257 is its one Staff-page test ("a new member of staff added on the Staff page"); the file is
# unchanged (above), so the line is too
bash "$here/browser.sh" tests/u53-staff-and-school.spec.ts tests/gate-password.spec.ts:257 || exit 1
bash "$here/browser.sh" --config "$here/playwright.config.ts" -g "a coordinator can still"
