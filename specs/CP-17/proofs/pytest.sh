#!/usr/bin/env bash
# Runs CP-17's database proofs with the engine's Python against the local test database (TEST_DATABASE_URL, built by
# `bin/testdb fresh`). No database is a FAIL with a plain reason, never a silent skip.
#   specs/CP-17/proofs/pytest.sh <test file or node id> ...
set -uo pipefail
root=$(cd "$(dirname "$0")/../../.." && pwd)
cd "$root"
py="${CP17_PYTHON:-$root/packages/engine/.venv/bin/python}"
if [ ! -x "$py" ]; then
  echo "CP-17 proof cannot run: the engine is not installed ($py missing; cd packages/engine && uv sync --extra dev)"
  exit 1
fi
if ! "$py" - <<'EOF'
import sys
sys.path.insert(0, "packages/engine")
try:
    import psycopg
    from engine.core import db
    with psycopg.connect(db.local_copy(), connect_timeout=5):
        pass
except Exception as e:  # any reason: say it and fail
    print(f"CP-17 proof cannot run: no local test database ({type(e).__name__}: {e}). "
          "Set TEST_DATABASE_URL to the copy `bin/testdb fresh` builds.")
    sys.exit(1)
EOF
then
  exit 1
fi
exec "$py" -m pytest -q -p no:cacheprovider -o addopts= --rootdir=specs/CP-17/proofs "$@"
