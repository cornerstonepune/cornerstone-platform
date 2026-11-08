"""CP-19 item 7: the engine's coordinator list (`packages/engine/engine/w3_read/k2_reads.py`) and the website's reports
page (`apps/web/app/(app)/growth/reports/page.tsx`, with `apps/web/lib/queries-reports.ts`) read their counts from
`coordinator_counts`; their own counting is gone; the existing browser and speed tests are unchanged on this branch
(their passing is ci.yml's browser job, which runs them; the engine's own tests run in its pytest job).
A search of the source, no database.
"""

import os
import re
import subprocess
from pathlib import Path

import pytest

ROOT = Path(os.environ.get("ATHENA_ROOT", Path(__file__).resolve().parents[3]))
K2_READS = ROOT / "packages/engine/engine/w3_read/k2_reads.py"
PAGE = ROOT / "apps/web/app/(app)/growth/reports/page.tsx"
QUERIES = ROOT / "apps/web/lib/queries-reports.ts"


def git(*args: str) -> str:
    out = subprocess.run(["git", "-C", str(ROOT), *args], capture_output=True, text=True)
    if out.returncode != 0:
        pytest.fail(f"git {' '.join(args)} failed: {out.stderr.strip() or 'not a git checkout'}")
    return out.stdout.strip()


def test_7_engine_coordinator_reads_the_function():
    src = K2_READS.read_text()
    assert "coordinator_counts" in src, "k2_reads.py does not read coordinator_counts"
    assert not re.search(r"\bcount\s*\(", src, re.I), "k2_reads.py still counts in its own SQL"
    assert "generate_series" not in src, "k2_reads.py still works out the class days itself"


def test_7_reports_page_reads_the_function():
    page, queries = PAGE.read_text(), QUERIES.read_text()
    assert "coordinator_counts" in page + queries, "the reports page does not read coordinator_counts"
    assert not re.search(r"\.filter\([^;]*?\)\s*\.length", page, re.S), \
        "the reports page still counts rows itself (.filter(...).length)"


def test_7_existing_browser_and_speed_tests_unchanged():
    base = None
    for ref in ("origin/main", "origin/master"):
        if subprocess.run(["git", "-C", str(ROOT), "rev-parse", "--verify", "-q", ref],
                          capture_output=True).returncode == 0:
            base = git("merge-base", ref, "HEAD")
            break
    assert base, "no origin/main to compare with: this proof needs the repository's history (fetch-depth 0)"
    changed = git("diff", "--name-only", "--diff-filter=MDR", base, "--",
                  "apps/web/tests", "apps/web/playwright.config.ts").split()
    assert not changed, f"existing browser/speed tests were changed or removed: {changed}"
