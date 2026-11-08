"""CP-5 item 2: a test fails if a function is added without a fixed search path.

Always: some engine test reads `proconfig` for a `search_path` entry (the design extends test_db_privileges.py).
With a test database (TEST_DATABASE_URL, the local copy bin/testdb builds; never the live one): the test files that
hold that check pass; add one function that pins its path and one that does not, and they fail naming only the
unpinned one; both are dropped afterwards. Without a test database only the first part runs, and says so.
Run with the engine's interpreter: packages/engine/.venv/bin/python specs/CP-5/proofs/guard.py
"""

import ast
import os
import subprocess
import sys
from pathlib import Path

ENGINE = Path(__file__).resolve().parents[3] / "packages" / "engine"
sys.path.insert(0, str(ENGINE))

from engine.core import db  # noqa: E402  (reads the repo's .env, as the test suite does)

UNPINNED, PINNED = "_cp5_unpinned_probe", "_cp5_pinned_probe"


def guard_files() -> list[Path]:
    """Engine test files with a test function whose module checks proconfig for search_path."""
    found = []
    for f in sorted((ENGINE / "tests").glob("test_*.py")):
        src = f.read_text()
        if "proconfig" not in src:
            continue
        tests = [n for n in ast.walk(ast.parse(src)) if isinstance(n, ast.FunctionDef) and n.name.startswith("test_")]
        if any("search_path" in (ast.get_source_segment(src, t) or "") for t in tests):
            found.append(f)
    return found


def pytest(files: list[Path]) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider", *map(str, files)],
        cwd=ENGINE, capture_output=True, text=True, env=os.environ.copy(), timeout=90,
    )


def main() -> int:
    files = guard_files()
    if not files:
        print("no engine test checks proconfig for a search_path: a function added without one fails nothing")
        return 1
    print("guard test in: " + ", ".join(f.name for f in files))
    if not os.environ.get("TEST_DATABASE_URL"):
        print("no TEST_DATABASE_URL: the guard's behaviour is not exercised here (static part only)")
        return 0

    url = db.local_copy()  # refuses anything but the local copy
    os.environ["DATABASE_URL"] = url
    before = pytest(files)
    if before.returncode != 0:
        print("the guard fails before any function is added:\n" + before.stdout[-1500:])
        return 1
    try:
        with db.connect(url) as c:
            c.execute(f"create function public.{UNPINNED}() returns int language sql as 'select 1'")
            c.execute(f"create function public.{PINNED}() returns int language sql set search_path = public as 'select 1'")
            c.commit()
        after = pytest(files)
    finally:
        with db.connect(url) as c:
            c.execute(f"drop function if exists public.{UNPINNED}()")
            c.execute(f"drop function if exists public.{PINNED}()")
            c.commit()
    out = after.stdout + after.stderr
    if after.returncode == 0 or UNPINNED not in out:
        print("a function added without a fixed search path did not fail the guard")
        return 1
    if PINNED in out:
        print("the guard also failed a function that pins its search path (it fails for another reason)")
        return 1
    print("the guard fails on the unpinned function, and only on it")
    return 0


if __name__ == "__main__":
    sys.exit(main())
