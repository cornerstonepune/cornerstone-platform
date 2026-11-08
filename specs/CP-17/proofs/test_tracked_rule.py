"""CP-17 item 2: the system and the website use the one rule; the old rule (any item with a price is tracked) is gone.

Two halves (design D9):
- a search: no check of `unit_value` decides tracking anywhere in `packages/engine/engine` or `apps/web`, and the
  website's `kept` (apps/web/components/educator/materials-table.tsx) reads only the engine's `tracked` value;
- behaviour: the engine's materials routes (`/materials/catalogue/list`, `/materials/read`) answer `tracked` by the
  school's `inventory.track_from_rupees`, so a priced item below it is not tracked and moving the setting moves it.
The routes run on the proof's own transaction, rolled back; the rows are placeholders (tests/materials_rows.py).
"""

import datetime as dt
import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from engine.api import deps
from engine.api.app import app
from engine.core import db
from engine.w2_print import materials_list as ml
from tests import materials_rows as m

from cp17_world import set_config

ROOT = Path(__file__).resolve().parents[3]
KEY = "test-engine-key"
H = {"X-Engine-Key": KEY}

# The old rule, in any spelling: a unit value compared with nothing / null / undefined, or `tracked` set from it.
OLD_RULE = [
    re.compile(r"unit_?value[\"'\]\)]*\s*(is\s+not\s+None|is\s+None|!==?\s*(null|undefined|None)|===?\s*(null|undefined|None))", re.I),
    re.compile(r"(null|undefined|None)\s*(!==?|===?)\s*\S*unit_?value", re.I),
    re.compile(r"tracked[\"']?\s*[:=]\s*[^,;\n]*unit_?value", re.I),
    re.compile(r"unit_?value\s+is\s+not\s+null\s+as\s+tracked", re.I),
    re.compile(r"(Boolean\(|!!)\s*\S*unit_?value", re.I),
]


def _code_files():
    for base, exts in ((ROOT / "packages" / "engine" / "engine", {".py", ".sql"}),
                       (ROOT / "apps" / "web", {".ts", ".tsx", ".js", ".jsx", ".mjs"})):
        for p in base.rglob("*"):
            if p.suffix in exts and p.is_file() and not ({"node_modules", ".next", "tests", "e2e"} & set(p.parts)):
                yield p


def test_2_no_old_tracking_rule_left_in_engine_or_website():
    found = []
    for p in _code_files():
        for n, line in enumerate(p.read_text(errors="ignore").splitlines(), 1):
            if any(r.search(line) for r in OLD_RULE):
                found.append(f"{p.relative_to(ROOT)}:{n}: {line.strip()}")
    assert not found, "the old rule (any item with a price is tracked) is still used:\n" + "\n".join(found)


def test_2_the_website_kept_reads_only_tracked():
    src = (ROOT / "apps" / "web" / "components" / "educator" / "materials-table.tsx").read_text()
    kept = [line for line in src.splitlines() if re.match(r"\s*(export\s+)?const\s+kept\s*=", line)]
    assert len(kept) == 1, "materials-table.tsx should define `kept` once"
    assert re.search(r"\.tracked\b", kept[0]), f"`kept` does not read the engine's tracked value: {kept[0].strip()}"
    assert not re.search(r"unit_?value|price|rupee", kept[0], re.I), f"`kept` decides tracking itself: {kept[0].strip()}"


@pytest.fixture
def engine(monkeypatch):
    monkeypatch.setenv("ENGINE_KEY", KEY)
    with db.connect() as conn:
        app.dependency_overrides[deps.get_conn] = lambda: conn
        try:
            with TestClient(app) as client:
                s = m.school(conn)
                set_config(conn, s["tenant"], "educator.timetable_enabled", True)
                yield client, conn, s
        finally:
            app.dependency_overrides.clear()
            conn.rollback()


def _catalogue(client, s) -> dict:
    r = client.post("/materials/catalogue/list", headers=H, json={"actor": s["email"]})
    assert r.status_code == 200, r.text
    return {i["code"]: i["tracked"] for i in r.json()["items"]}


def _read(client, s, list_id) -> dict:
    r = client.post("/materials/read", headers=H, json={"actor": s["email"], "list_id": str(list_id)})
    assert r.status_code == 200, r.text
    return {line["material_code"]: line["tracked"] for g in r.json()["groups"] for line in g["lines"]}


def test_2_the_engine_routes_answer_tracked_by_the_threshold(engine):
    client, conn, s = engine
    t = s["tenant"]
    cheap, dear, blank = m.item(conn, s, "Chalk", unit_value=50), m.item(conn, s, "Scale", unit_value=900), \
        m.item(conn, s, "Clay")
    lid = ml.build(conn, s["class"], "fortnight", m.MON, m.MON + dt.timedelta(days=13))
    for code in (cheap, dear, blank):
        ml.add(conn, lid, code, 1, m.MON, None, s["staff"])

    set_config(conn, t, "inventory.track_from_rupees", 500)
    cat, lines = _catalogue(client, s), _read(client, s, lid)
    assert [cat[c] for c in (cheap, dear, blank)] == [False, True, False], "catalogue: a priced item below the threshold is tracked"
    assert [lines[c] for c in (cheap, dear, blank)] == [False, True, False], "list: a priced item below the threshold is tracked"

    set_config(conn, t, "inventory.track_from_rupees", 10)
    cat, lines = _catalogue(client, s), _read(client, s, lid)
    assert [cat[c] for c in (cheap, dear, blank)] == [True, True, False], "catalogue does not follow the setting"
    assert [lines[c] for c in (cheap, dear, blank)] == [True, True, False], "list does not follow the setting"
