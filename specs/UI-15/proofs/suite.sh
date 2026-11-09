#!/usr/bin/env bash
# UI-15 proof 5: the upgrade changes no page.
# - u51, screens.spec.ts and the journey test (a *.spec.ts under apps/web/tests or apps/web/e2e importing athena-journey:
#   UI-1's file, not on main yet; required whenever it exists) run here, in a real browser, and must all run and pass.
# - The whole browser suite takes longer than `athena done` allows one spec (900 s): that it passes is ci.yml's browser
#   job, a required check on the pull request (CP-3's pattern). `suite.sh --full` runs the whole suite here instead.
# - bin/check passes, and ux.frozen in workflows.json has not grown against main.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../../.." && pwd)
report="$root/apps/web/test-results/ui15-suite.json"
mkdir -p "$(dirname "$report")"
journeys=$(grep -rlE "from\s+[\"'][^\"']*athena-journey[\"']" "$root/apps/web/tests" "$root/apps/web/e2e" --include='*.spec.ts' 2>/dev/null)
files=()
[ "${1:-}" = --full ] || files=("$root"/apps/web/tests/u51-*.spec.ts "$root/apps/web/tests/screens.spec.ts" $journeys)
PLAYWRIGHT_JSON_OUTPUT_NAME="$report" bash "$here/browser.sh" --reporter=list,json "${files[@]}"
rc=$?
# every named file ran (a journey test outside the suite's testDir would not) and every test in it passed
node -e '
const r = require(process.argv[1]); const must = process.argv.slice(2);
const seen = {};
const walk = (s) => { for (const c of s.suites || []) walk(c);
  for (const sp of s.specs || []) (seen[sp.file.split("/").pop()] ||= []).push(sp.ok && sp.tests.every((t) => ["expected", "flaky"].includes(t.status))); };
walk(r);
let bad = 0;
if (r.stats.unexpected || r.stats.skipped) { console.log("suite:", JSON.stringify(r.stats)); bad = 1; }
for (const m of must) {
  const files = Object.keys(seen).filter((f) => (m.endsWith("*") ? f.startsWith(m.slice(0, -1)) : f === m));
  if (!files.length) { console.log(`${m}: did not run`); bad = 1; }
  for (const f of files) if (!seen[f].every(Boolean)) { console.log(`${f}: failed`); bad = 1; }
}
process.exit(bad);
' "$report" "u51-*" "screens.spec.ts" $(for j in $journeys; do basename "$j"; done) || rc=1
"$root/bin/check" || rc=1
python3 "$here/static.py" frozen || rc=1
exit $rc
