"""CP-3 item 7: the browser and speed tests pass with the site connected as the restricted login, their assertions
unchanged, and the test rows made in the shape live has.

The browser and speed suites run in ci.yml's browser job, where the site connects as app_web; that job is what passes or
fails them. What this proves from the repository:
- the existing specs are unchanged: no spec, helper or config under apps/web/tests (nor playwright.config.ts) was
  changed, renamed or deleted against main, except tests/global-setup.ts (new files may be added). So no assertion of an
  existing spec changed. One existing spec may differ, and only in one way: apps/web/tests/u70-feedback-rules.spec.ts
  may add exactly one line `const ZONE = "<string literal>";` (with an optional trailing comment) and pass `, ZONE` as
  the second argument of its `issueBody(...)` calls (CP-24 made `issueBody` take the school's zone). With that line
  removed and every `, ZONE)` turned back into `)` the file must be byte-identical to main's; unchanged also passes;
- global-setup.ts installs tests/access-fixture.sql, and that fixture gives the rows the shape live has: a sign-in entry
  with classes gets a staff row (staff and pii.staff), a current grant per class it teaches (staff_role_grant with
  school_class_id), and a child with a class label gets a class (school_class) and an open enrolment;
- the suite's own signed-in user holds a grant in the everything group (a coordinator role).
"""

import os
import re
import subprocess
from pathlib import Path

import pytest

ROOT = Path(os.environ.get("ATHENA_ROOT", Path(__file__).resolve().parents[3]))
SETUP = "apps/web/tests/global-setup.ts"
FIXTURE = "apps/web/tests/access-fixture.sql"
U70 = "apps/web/tests/u70-feedback-rules.spec.ts"  # CP-24: the one existing spec allowed its zone edit


def git(*args: str) -> str:
    out = subprocess.run(["git", "-C", str(ROOT), *args], capture_output=True, text=True)
    if out.returncode != 0:
        pytest.fail(f"git {' '.join(args)} failed: {out.stderr.strip() or 'not a git checkout'}")
    return out.stdout.strip()


def git_raw(*args: str) -> str:
    out = subprocess.run(["git", "-C", str(ROOT), *args], capture_output=True, text=True)
    if out.returncode != 0:
        pytest.fail(f"git {' '.join(args)} failed: {out.stderr.strip()}")
    return out.stdout  # not stripped: compared byte for byte


def merge_base() -> str:
    for ref in ("origin/main", "origin/master"):
        if subprocess.run(["git", "-C", str(ROOT), "rev-parse", "--verify", "-q", ref], capture_output=True).returncode == 0:
            return git("merge-base", ref, "HEAD")
    pytest.fail("no origin/main to compare with: this proof needs the repository's history (fetch-depth 0)")


def flat(path: str) -> str:
    p = ROOT / path
    assert p.exists(), f"{path} does not exist"
    return re.sub(r"\s+", " ", p.read_text().lower())


def test_7_existing_browser_and_speed_tests_unchanged():
    # working tree against main: any existing file modified, deleted, renamed or retyped (added files are allowed)
    base = merge_base()
    changed = git("diff", "--name-only", "--diff-filter=MDRT", base, "--",
                  "apps/web/tests", "apps/web/playwright.config.ts").split()
    others = [f for f in changed if f not in (SETUP, U70)]
    assert not others, f"existing browser/speed tests were changed, renamed or removed: {others}"
    # u70 may differ from main only by CP-24's edit: one `const ZONE = "<literal>";` line, and `, ZONE` as the second
    # argument of issueBody(...). Undo exactly that edit and the file must be main's, byte for byte.
    rule = (f"{U70} may differ from main only by one added line `const ZONE = \"<string literal>\";` (optional "
            "trailing comment) and `, ZONE` added as the second argument of its issueBody(...) calls")
    assert (ROOT / U70).exists(), f"{U70} was removed or renamed; {rule}"
    now = (ROOT / U70).read_text()
    main = git_raw("show", f"{base}:{U70}")
    if now == main:
        return
    zone_lines = [l for l in now.splitlines(keepends=True) if re.match(r"\s*const\s+ZONE\b", l)]
    assert len(zone_lines) == 1 and re.fullmatch(r'const ZONE = "[^"\\\n]*";( *//[^\n]*)?\n', zone_lines[0]), \
        f"{U70} must have exactly one `const ZONE` line whose value is a string literal; {rule}"
    undone = now.replace(zone_lines[0], "", 1).replace(", ZONE)", ")")
    assert undone == main, f"{U70} differs from main by more than the allowed edit; {rule}"


def test_7_test_rows_have_the_shape_live_has():
    setup = (ROOT / SETUP).read_text()
    assert "access-fixture.sql" in setup and re.search(r"sql\.(unsafe|file)\(", setup), \
        "global-setup.ts does not install access-fixture.sql into the test copy"
    sql = flat(FIXTURE)
    assert re.search(r"insert into (public\.)?staff \(", sql), "the fixture gives an invented educator no staff row"
    assert re.search(r"insert into pii\.staff \(", sql), "the fixture gives an invented educator no pii.staff row"
    assert re.search(r"insert into (public\.)?staff_role_grant \([^)]*school_class_id", sql), \
        "the fixture gives no grant per class the educator teaches"
    assert "classes" in sql, "the fixture does not read the classes a sign-in entry teaches"
    assert re.search(r"insert into (public\.)?school_class \(", sql), "the fixture gives a class label no class"
    m = re.search(r"insert into (public\.)?enrolment \(([^)]*)\)", sql)
    assert m, "the fixture gives a child with a class label no enrolment"
    assert "to_date" not in m.group(2) or re.search(r"to_date is null", sql), "the fixture's enrolment is not open"


def test_7_the_suites_user_is_in_the_everything_group():
    src = (ROOT / SETUP).read_text()
    sql = re.sub(r"\s+", " ", src.lower())
    assert re.search(r"insert into (public\.)?staff\b(?!_)", sql), \
        "global-setup.ts gives the signed-in test user no staff row: the rules would show it nothing"
    assert re.search(r"insert into pii\.staff\b", sql), \
        "global-setup.ts gives the test user no pii.staff row, so its sign-in email resolves to no one"
    m = re.search(r"insert into (public\.)?staff_role_grant\b(.{0,600})", sql)
    assert m, "global-setup.ts gives the test user no role grant"
    assert "coordinator" in m.group(2), "the test user's grant is not a coordinator role (the everything group)"
