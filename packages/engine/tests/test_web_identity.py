"""CP-2: the website's anonymous pool (`rawSql`) is imported only where asking "who" requires it, so a new caller cannot go
around the identity (design.md decision 4)."""

import re
from pathlib import Path

WEB = Path(__file__).resolve().parents[3] / "apps" / "web"
ALLOWED = {"lib/db.ts", "lib/queries.ts", "scripts/check-pooler.ts"}


def test_rawsql_is_imported_only_where_allowed():
    found = set()
    for p in WEB.rglob("*.ts*"):
        parts = p.relative_to(WEB).parts
        if parts[0] in {"node_modules", ".next", "tests", "test-results"} or p.suffix not in {".ts", ".tsx"}:
            continue
        if re.search(r"\brawSql\b", p.read_text(errors="ignore")):
            found.add("/".join(parts))
    assert found <= ALLOWED, f"rawSql used outside the allow-list: {sorted(found - ALLOWED)}"


def test_the_uuid_shape_is_the_same_in_the_site_and_the_database():
    ts = (WEB / "lib" / "db.ts").read_text()
    sql = next((WEB.parent.parent / "supabase" / "migrations").glob("*_current_staff.sql")).read_text()
    shape = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
    assert shape in ts and shape in sql
