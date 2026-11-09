#!/usr/bin/env bash
# Runs CP-24's proofs with the engine's Python. Database proofs (proofs/db/) run against the local test database
# (TEST_DATABASE_URL, built by `bin/testdb fresh`); no database is a FAIL with a plain reason, never a silent skip.
# `--no-db` first runs a proof that reads only the repository.
#   specs/CP-24/proofs/pytest.sh [--no-db] <test file or node id> [pytest args ...]
set -uo pipefail
root=$(cd "$(dirname "$0")/../../.." && pwd)
cd "$root"
py="${CP24_PYTHON:-$root/packages/engine/.venv/bin/python}"
if [ ! -x "$py" ]; then
  echo "CP-24 proof cannot run: the engine is not installed ($py missing; cd packages/engine && uv sync --extra dev)"
  exit 1
fi
if ! "$py" -c "import pytest" 2>/dev/null; then
  echo "CP-24 proof cannot run: the engine's test tools are not installed (cd packages/engine && uv sync --extra dev)"
  exit 1
fi
if [ "${1:-}" = "--no-db" ]; then
  shift
elif ! "$py" - <<'PY'
import sys
sys.path.insert(0, "packages/engine")
try:
    import psycopg
    from engine.core import db
    with psycopg.connect(db.local_copy(), connect_timeout=5):
        pass
except Exception as e:  # any reason: say it and fail
    print(f"CP-24 proof cannot run: no local test database ({type(e).__name__}: {e}). "
          "Set TEST_DATABASE_URL to the copy `bin/testdb fresh` builds.")
    sys.exit(1)
PY
then
  exit 1
fi
exec "$py" -m pytest -q -p no:cacheprovider -o addopts= --rootdir=specs/CP-24/proofs "$@"
