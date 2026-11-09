"""CP-2: the website's anonymous pool (`rawSql`) is imported only where asking "who" requires it, so a new caller cannot go
around the identity (design.md decision 4)."""

import re
from pathlib import Path

WEB = Path(__file__).resolve().parents[3] / "apps" / "web"
ALLOWED = {"lib/db.ts", "lib/queries.ts", "scripts/check-pooler.ts", "scripts/check-identity-once.ts"}


def test_rawsql_is_imported_only_where_allowed():
    found = set()
    for p in WEB.rglob("*.ts*"):
        parts = p.relative_to(WEB).parts
        if parts[0] in {"node_modules", ".next", "tests", "test-results"} or p.suffix not in {".ts", ".tsx"}:
            continue
        if re.search(r"\brawSql\b", p.read_text(errors="ignore")):
            found.add("/".join(parts))
    assert found <= ALLOWED, f"rawSql used outside the allow-list: {sorted(found - ALLOWED)}"


def test_a_query_that_carries_an_identity_runs_once():
    import os
    import shutil
    import subprocess

    import pytest

    url = os.environ.get("TEST_DATABASE_URL")
    if not (url and shutil.which("node") and (WEB / "node_modules" / "postgres").exists()):
        pytest.skip("needs TEST_DATABASE_URL, node and the website's packages (the website job has them)")
    out = subprocess.run(
        ["node", "scripts/check-identity-once.ts"],
        cwd=WEB,
        capture_output=True,
        text=True,
        env={**os.environ, "TEST_DATABASE_URL": url},
    )
    assert out.returncode == 0, out.stderr


def test_the_uuid_shape_is_the_same_in_the_site_and_the_database():
    ts = (WEB / "lib" / "db.ts").read_text()
    sql = next((WEB.parent.parent / "supabase" / "migrations").glob("*_current_staff.sql")).read_text()
    shape = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
    assert shape in ts and shape in sql
