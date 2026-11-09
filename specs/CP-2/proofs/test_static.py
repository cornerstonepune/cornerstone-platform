"""CP-2 items 1, 3 and 5: what can be proven from the repository itself, with no database.

1  the decision record: chosen option, rejected options with reasons, amended with the real-pooler result, and not
   committed after the first change to the website's database layer;
3  the identity is set in one place only (apps/web/lib/db.ts), transaction-local, and that file never reads the
   request itself (no cookies, headers or query string): the identity reaches it from the verified sign-in;
5  the existing browser and speed tests are unchanged on this branch (their passing is ci.yml's browser job).
"""

import os
import re
import subprocess
from pathlib import Path

import pytest

ROOT = Path(os.environ.get("ATHENA_ROOT", Path(__file__).resolve().parents[3]))
WEB = ROOT / "apps" / "web"
DB_TS = WEB / "lib" / "db.ts"


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


# ---- 1 ----------------------------------------------------------------------------------------------------------

def _decision() -> Path:
    found = [p for p in sorted((ROOT / "docs" / "adr").glob("*.md")) if re.search(r"\bCP-2\b", p.read_text())]
    assert found, "no decision record in docs/adr/ names CP-2"
    assert len(found) == 1, f"more than one decision record names CP-2: {[p.name for p in found]}"
    return found[0]


def test_1_decision_names_chosen_and_rejected_options():
    text = _decision().read_text()
    low = text.lower()
    assert re.search(r"\bchosen\b", low), "the record does not say which option was chosen"
    assert re.search(r"\brejected\b", low), "the record does not say which options were rejected"
    assert "transaction" in low, "option (a), identity and query in one transaction, is not discussed"
    assert re.search(r"long[- ]running|always[- ]on|persistent server", low), "option (b), a long-running server, is not discussed"
    assert "supabase" in low and "token" in low, "option (c), Supabase's interface with a signed token, is not discussed"
    assert "because" in low or "reason" in low, "the rejections carry no reason"


def test_1_decision_amended_with_real_pooler_result():
    text = _decision().read_text()
    m = re.search(r"^#+\s*.*\b(result|amend\w*)\b.*$", text, re.I | re.M)
    assert m, "the decision record has no result/amendment section"
    after = text[m.end():].lower()
    assert "pooler" in after, "the result section does not report the run on the real pooler"


def test_1_decision_not_committed_after_the_code():
    base = merge_base()
    adr = _decision().relative_to(ROOT)
    adr_commits = git("log", "--format=%H", "--reverse", f"{base}..HEAD", "--", str(adr)).split()
    code_commits = git("log", "--format=%H", "--reverse", f"{base}..HEAD", "--", "apps/web/lib/db.ts").split()
    if not adr_commits:  # already on main: the record predates this branch
        assert git("log", "--format=%H", "-1", "--", str(adr)), f"{adr} is not committed"
        return
    if code_commits:
        order = git("rev-list", "--reverse", f"{base}..HEAD").split()
        assert order.index(adr_commits[0]) <= order.index(code_commits[0]), \
            "apps/web/lib/db.ts was changed in a commit before the decision record was first committed"


# ---- 3 ----------------------------------------------------------------------------------------------------------

SKIP_DIRS = {"node_modules", "tests", "test-results", "playwright-report", ".git"}
EXTS = {".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".sql"}
IDENTITY = re.compile(r"set_config|app\.staff_id")


def test_3_identity_setting_only_in_db_ts():
    offenders = []
    for dirpath, dirnames, filenames in os.walk(WEB):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".next")]
        for name in filenames:
            p = Path(dirpath) / name
            if p.suffix in EXTS and p != DB_TS and IDENTITY.search(p.read_text(errors="ignore")):
                offenders.append(str(p.relative_to(ROOT)))
    assert not offenders, f"the identity setting appears outside apps/web/lib/db.ts: {offenders}"


def test_3_db_ts_sets_identity_transaction_local():
    src = DB_TS.read_text()
    assert re.search(r"set_config\(\s*'app\.staff_id'\s*,[^;]*?,\s*true\s*\)", src), \
        "apps/web/lib/db.ts does not set app.staff_id with set_config(..., true)"
    assert not re.search(r"set_config\(\s*'app\.staff_id'\s*,[^;]*?,\s*false\s*\)", src), \
        "apps/web/lib/db.ts sets app.staff_id session-wide (false): it would survive into the next request"


def test_3_db_ts_never_reads_the_request():
    src = DB_TS.read_text()
    for free in ("next/headers", "cookies(", "headers(", "searchParams", "x-staff"):
        assert free not in src, f"apps/web/lib/db.ts reads '{free}': identity must come only from the verified sign-in"


# ---- 5 ----------------------------------------------------------------------------------------------------------

def test_5_existing_browser_and_speed_tests_unchanged():
    base = merge_base()
    changed = git("diff", "--name-only", "--diff-filter=MDR", base, "--",
                  "apps/web/tests", "apps/web/playwright.config.ts").split()
    assert not changed, f"existing browser/speed tests were changed or removed: {changed}"
