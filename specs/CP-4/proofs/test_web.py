"""CP-4 item 5: the existing website pages and speed tests pass unchanged for people allowed to see them.

Their passing is CI's browser job, which already runs the site as the restricted website login (app_web: ci.yml sets
TEST_WEB_DATABASE_URL, playwright.config.ts starts the site on it), so the rules CP-4 adds are in force there. What is
proven here:
- no browser or speed test was deleted, skipped or weakened against origin/main (the setup file may change, the tests
  may not);
- the CI test user is a person the rules let see everything: apps/web/tests/global-setup.ts gives it a staff row, a
  pii.staff row and a current grant, and the role it grants is in the "everything" group on the throwaway database.
"""

import re
import subprocess

import pytest

from conftest import ROOT

WEB = ROOT / "apps" / "web"
SETUP = WEB / "tests" / "global-setup.ts"


def git(*args: str) -> str:
    out = subprocess.run(["git", "-C", str(ROOT), *args], capture_output=True, text=True)
    if out.returncode != 0:
        pytest.fail(f"git {' '.join(args)} failed: {out.stderr.strip() or 'not a git checkout'}")
    return out.stdout


def merge_base() -> str:
    for ref in ("origin/main", "origin/master"):
        if subprocess.run(["git", "-C", str(ROOT), "rev-parse", "--verify", "-q", ref],
                          capture_output=True).returncode == 0:
            return git("merge-base", ref, "HEAD").strip()
    pytest.fail("no origin/main to compare with: this proof needs the repository's history (fetch-depth 0)")


SKIPS = re.compile(r"\.(skip|fixme|only)\s*\(")


def _counts(text: str) -> tuple[int, int, int]:
    return (len(re.findall(r"\btest(\.step)?\s*\(", text)), len(re.findall(r"\bexpect(\.\w+)?\s*\(", text)),
            len(SKIPS.findall(text)))


def test_5_no_browser_or_speed_test_deleted_skipped_or_weakened():
    base = merge_base()
    gone = git("diff", "--name-only", "--diff-filter=DR", base, "--", "apps/web/tests",
               "apps/web/playwright.config.ts").split()
    assert not gone, f"browser/speed test files deleted or renamed: {gone}"
    weakened = []
    for path in git("diff", "--name-only", "--diff-filter=M", base, "--", "apps/web/tests").split():
        if path.endswith("global-setup.ts") or not path.endswith((".ts", ".tsx")):
            continue
        old, new = _counts(git("show", f"{base}:{path}")), _counts((ROOT / path).read_text())
        if new[0] < old[0] or new[1] < old[1] or new[2] > old[2]:
            weakened.append(f"{path}: tests/expects/skips {old} -> {new}")
    assert not weakened, weakened
    config = git("diff", base, "--", "apps/web/playwright.config.ts")
    assert not re.search(r"^\+.*(testIgnore|grepInvert|\.skip)", config, re.M), "playwright.config.ts now skips tests"


def test_5_ci_test_user_is_in_the_everything_group(conn):
    src = SETUP.read_text()
    for table in ("staff", "pii.staff", "staff_role_grant"):
        assert re.search(rf"insert\s+into\s+{re.escape(table)}\b", src, re.I), \
            f"global-setup.ts does not give the test user a {table} row"
    m = re.search(r"role:\s*[\"'](\w+)[\"']", src)
    assert m, "global-setup.ts names no role for the test user"
    role = m.group(1)
    # a new fake school, so its groups are the ones every school is given (rolled back with the transaction)
    tenant = conn.execute("insert into tenant (slug, name) values ('cp4-proof-web', 'CP-4 proof school') "
                          "returning id").fetchone()[0]
    group = conn.execute("select group_code from public.access_role_group where tenant_id = %s and role_code = %s",
                         (tenant, role)).fetchall()
    assert group == [("everything",)], f"the test user's role {role!r} is in {group}, not the everything group"
