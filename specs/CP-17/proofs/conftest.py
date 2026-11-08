"""CP-17 proofs run on the engine's own test harness: packages/engine/tests/conftest.py, loaded here as it is.

It points DATABASE_URL at the local copy named by TEST_DATABASE_URL (refusing any other address) and fails a module
that leaves a committed row. Every proof here works inside one transaction that is rolled back.
"""

import runpy
import sys
from pathlib import Path

ENGINE = Path(__file__).resolve().parents[3] / "packages" / "engine"
sys.path.insert(0, str(ENGINE))

globals().update(
    {k: v for k, v in runpy.run_path(str(ENGINE / "tests" / "conftest.py")).items() if not k.startswith("__")}
)
