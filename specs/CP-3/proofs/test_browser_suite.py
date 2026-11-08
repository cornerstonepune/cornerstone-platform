"""CP-3 item 7: the existing website pages and speed tests pass unchanged for a person allowed to see them.

The browser and speed suites run in ci.yml's browser job, where the site already connects as app_web; that job is what
passes or fails them. What this proves from the repository:
- the suites are unchanged: no spec, helper or config under apps/web/tests (nor playwright.config.ts) was changed,
  renamed or deleted against main, except the one fixture the scope's design changes, tests/global-setup.ts;
- that fixture makes the signed-in test user someone the rules let see everything: a staff row, a pii.staff row with the
  test user's email, and a current coordinator grant (the everything group). Without it, once the rules are on, every
  page that reads children, enrolment, staff or notes is empty for the suite's user.
"""

import os
import re
import subprocess
from pathlib import Path

import pytest

ROOT = Path(os.environ.get("ATHENA_ROOT", Path(__file__).resolve().parents[3]))
SETUP = "apps/web/tests/global-setup.ts"


def git(*args: str) -> str:
    out = subprocess.run(["git", "-C", str(ROOT), *args], capture_output=True, text=True)
    if out.returncode != 0:
        pytest.fail(f"git {' '.join(args)} failed: {out.stderr.strip() or 'not a git checkout'}")
    return out.stdout.strip()


def merge_base() -> str:
    for ref in ("origin/main", "origin/master"):
        if subprocess.run(["git", "-C", str(ROOT), "rev-parse", "--verify", "-q", ref], capture_output=True).returncode == 0:
            return git("merge-base", ref, "HEAD")
    pytest.fail("no origin/main to compare with: this proof needs the repository's history (fetch-depth 0)")


def test_7_existing_browser_and_speed_tests_unchanged():
    changed = git("diff", "--name-only", "--diff-filter=MDRT", merge_base(), "--",
                  "apps/web/tests", "apps/web/playwright.config.ts").split()
    others = [f for f in changed if f != SETUP]
    assert not others, f"existing browser/speed tests were changed, renamed or removed: {others}"


def test_7_the_suites_user_is_in_the_everything_group():
    src = (ROOT / SETUP).read_text()
    sql = re.sub(r"\s+", " ", src.lower())
    assert re.search(r"insert into (public\.)?staff\b(?!_)", sql), \
        "global-setup.ts gives the signed-in test user no staff row: the rules would show it nothing"
    assert re.search(r"insert into pii\.staff\b", sql), \
        "global-setup.ts gives the test user no pii.staff row, so its sign-in email resolves to no one"
    m = re.search(r"insert into (public\.)?staff_role_grant\b(.{0,600})", sql)
    assert m, "global-setup.ts gives the test user no role grant"
    assert "coordinator" in m.group(2) or "test_staff.role" in m.group(2), \
        "the test user's grant is not coordinator (the everything group)"
    assert '"coordinator"' in src or "'coordinator'" in src
