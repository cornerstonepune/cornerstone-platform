"""The core every pull request runs stays small, and every line of its list names a real test (Nimish, 17 Nov 2026).

The full suite runs nightly (.github/workflows/nightly.yml). The core is tests/core.txt for the engine and the `@core` tag
for the browser. Growing it past its budget is a deliberate edit of the numbers below, never a silent drift.
"""

import re
import subprocess
import sys
from pathlib import Path

from tests.conftest import core_entries, is_core

ENGINE = Path(__file__).resolve().parent.parent
WEB_TESTS = ENGINE.parent.parent / "apps" / "web" / "tests"

# The budget: about 350 tests across the engine and the browser, and under 10 minutes of wall time on CI. The browser's
# share is counted by tag: one `@core` per test title.
ENGINE_CORE_MAX = 230
BROWSER_CORE_MAX = 120
CORE_MAX = 350


def collected():
    out = subprocess.run(
        [sys.executable, "-m", "pytest", "--collect-only", "-q", "-p", "no:cacheprovider", "-o", "addopts="],
        cwd=ENGINE,
        capture_output=True,
        text=True,
        check=False,
    ).stdout
    return [x for x in out.splitlines() if "::" in x]


def browser_core_count():
    return sum(
        len(re.findall(r"@core\b", p.read_text(encoding="utf-8"))) for p in WEB_TESTS.glob("*.spec.ts")
    )


def test_every_line_of_the_core_list_names_a_test_that_exists():
    ids = collected()
    missing = [e for e in core_entries() if not any(is_core(i, {e}) for i in ids)]
    assert not missing, f"tests/core.txt names tests that do not exist (renamed or deleted?): {missing}"


def test_the_core_stays_inside_its_budget():
    entries = set(core_entries())
    engine = sum(1 for i in collected() if is_core(i, entries))
    browser = browser_core_count()
    assert engine <= ENGINE_CORE_MAX, (
        f"the engine core is {engine} tests, its budget {ENGINE_CORE_MAX}: move some to nightly"
    )
    assert browser <= BROWSER_CORE_MAX, (
        f"the browser core is {browser} tests, its budget {BROWSER_CORE_MAX}: move some to nightly"
    )
    assert engine + browser <= CORE_MAX, f"the core is {engine + browser} tests, its budget {CORE_MAX}"


def test_the_core_is_not_empty():
    assert sum(1 for i in collected() if is_core(i, set(core_entries()))) >= 50
    assert browser_core_count() >= 10
