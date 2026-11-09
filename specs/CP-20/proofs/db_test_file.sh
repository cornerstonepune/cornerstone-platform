#!/usr/bin/env bash
# CP-20 criterion 4: packages/engine/tests/test_test_database.py runs and passes with none skipped.
# Only GitHub's proofs job, after setup.sh has built the throwaway database, can pass this. Anywhere without
# TEST_DATABASE_URL pointing at a reachable local Postgres it FAILS with the reason, never a silent skip.
set -uo pipefail
root=$(cd "$(dirname "$0")/../../.." && pwd)
eng="$root/packages/engine"
py="$eng/.venv/bin/python"
[ -x "$py" ] || { echo "CP-20 #4 cannot run: the engine is not installed ($py missing; setup.sh runs uv sync)"; exit 1; }
[ -n "${TEST_DATABASE_URL:-}" ] || { echo "CP-20 #4: TEST_DATABASE_URL is not set (no test database here; setup.sh sets it only in GitHub's job)"; exit 1; }
cd "$eng"
"$py" - <<'EOF' || exit 1
import os, sys
from urllib.parse import urlparse
import psycopg
url = os.environ["TEST_DATABASE_URL"]
if urlparse(url).hostname not in ("127.0.0.1", "localhost"):
    sys.exit("CP-20 #4: TEST_DATABASE_URL is not on this machine (127.0.0.1 or localhost)")
try:
    with psycopg.connect(url, connect_timeout=5):
        pass
except Exception as e:
    sys.exit(f"CP-20 #4: the test database does not answer ({type(e).__name__})")
EOF
xml=$(mktemp)
trap 'rm -f "$xml"' EXIT
"$py" -m pytest -q -p no:cacheprovider -rs tests/test_test_database.py --junitxml="$xml"
rc=$?
[ "$rc" -eq 0 ] || { echo "CP-20 #4: tests/test_test_database.py failed (pytest exit $rc)"; exit 1; }
"$py" - "$xml" <<'EOF'
import sys, xml.etree.ElementTree as ET
r = ET.parse(sys.argv[1]).getroot()
s = r if r.tag == "testsuite" else r.find("testsuite")
tests, skipped = int(s.get("tests", 0)), int(s.get("skipped", 0))
print(f"tests={tests} skipped={skipped}")
sys.exit(0 if tests > 0 and skipped == 0 else "CP-20 #4: a test was skipped, or none ran")
EOF
