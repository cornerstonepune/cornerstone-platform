#!/usr/bin/env bash
# CP-17 item 7: the new tables' access rules and the existing materials tests, still all there (test_access.py), then
# those existing tests run as the engine runs them, against the same local test database. Both must pass.
set -uo pipefail
root=$(cd "$(dirname "$0")/../../.." && pwd)
bash "$root/specs/CP-17/proofs/pytest.sh" "$root/specs/CP-17/proofs/test_access.py"
access=$?
files=$("$root/packages/engine/.venv/bin/python" -c "
import sys; sys.path.insert(0, '$root/specs/CP-17/proofs')
from existing_materials_tests import EXISTING
print(' '.join(p.removeprefix('packages/engine/') for p in EXISTING))")
cd "$root/packages/engine" && .venv/bin/python -m pytest -q -p no:cacheprovider $files
existing=$?
[ "$access" -eq 0 ] && [ "$existing" -eq 0 ]
