"""CP-11 proofs run on the engine's own test harness: packages/engine/tests/conftest.py, loaded here as it is.

It points DATABASE_URL at the local copy named by TEST_DATABASE_URL (refusing any other address) and fails a module
that leaves a committed row. `bin/engine timetable generate` is a second process, so each module commits its made-up
class and deletes every row made since it began (`forgets_what_it_commits`, the engine's own fixture).
"""

import runpy
import sys
from pathlib import Path

ENGINE = Path(__file__).resolve().parents[3] / "packages" / "engine"
sys.path.insert(0, str(ENGINE))
sys.path.insert(0, str(Path(__file__).resolve().parent))

globals().update(
    {k: v for k, v in runpy.run_path(str(ENGINE / "tests" / "conftest.py")).items() if not k.startswith("__")}
)
