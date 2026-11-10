"""The settings the engine reads, as their seed files hold them (core/settings.py)."""

import ast
import re

import pytest

from engine.core import db, settings


def _named_in_code() -> set[str]:
    """Every string the engine's code holds whole; a purpose it asks a prompt for is one of them."""
    named: set[str] = set()
    for path in (db.REPO_ROOT / "packages/engine/engine").rglob("*.py"):
        for node in ast.walk(ast.parse(path.read_text())):
            if isinstance(node, ast.Constant) and isinstance(node.value, str):
                named.add(node.value)
    return named


def test_every_prompt_the_seed_makes_active_is_one_the_engine_asks_for():
    """Rule 7: a prompt is made active once its eval is scored, so an active prompt no code asks for claims a use and a
    score it does not have. `read_cells` and `word_context` did, from the first seed until 2026-10-01; a prompt
    designed for a later step stays inactive until that step asks for it (goals/p1-no-loose-ends.yaml)."""
    active = {p["purpose"] for p in settings.seed("prompts.json", "prompts") if p.get("active")}
    assert sorted(active - _named_in_code()) == []


def test_every_setting_is_read_through_one_reader():
    """CP-27, Done when 11: every setting and threshold is a `config` row, read only through `core/settings.py`. No other
    engine file reads the table (a writer, as `voice_switch` turning a switch, may write it), and no private copy of the
    reader grows again (goals/p2-less-code.yaml: three had)."""
    # the table named in SQL: followed by an alias, a clause, or the end of the string, never by prose ("config rows")
    reads = re.compile(
        r"\b(from|join)\s+(config|threshold)(\s+\w{1,2})?\s*(where|on|join|group|order|for|[\"')])", re.I
    )
    readers = [
        str(p.relative_to(db.REPO_ROOT))
        for p in (db.REPO_ROOT / "packages/engine/engine").rglob("*.py")
        if p.name != "settings.py" and reads.search(p.read_text())
    ]
    assert readers == []
    copies = [
        str(p.relative_to(db.REPO_ROOT))
        for p in (db.REPO_ROOT / "packages/engine/engine").rglob("*.py")
        if re.search(r"^def _(config|threshold)\(", p.read_text(), re.M)
    ]
    assert copies == []


@pytest.fixture
def conn():
    with db.connect() as c:
        yield c
        c.rollback()


def test_a_number_is_a_setting_like_any_other_and_keeps_its_number(conn):
    """The numbers (`thresholds.json`) and the rest (`config.json`) are one table: each seeded key is there, a number
    reads back as the number the file holds."""
    for r in settings.seed("thresholds.json", "thresholds"):
        assert settings.threshold(conn, r["key"], float("nan")) == float(r["value"]), r["key"]
    for c in settings.seed("config.json", "config"):
        assert settings.config(conn, c["key"]) is not None, c["key"]
    settings.put(conn, "exposure.days", 9)
    assert settings.exposure_days(conn) == 9, "a school's change is read at once"


def test_a_new_school_gets_every_default_from_one_function(conn):
    """A new school copies every setting of the first school, numbers and words alike, from one function; its list of
    people is its own. Its grades carry K2's observed rule."""
    first = conn.execute("select id from tenant order by created_at, id limit 1").fetchone()["id"]
    new = conn.execute(
        "insert into tenant (slug, name) values ('settings-test-school', 'A new school') returning id"
    ).fetchone()["id"]
    theirs = {k: settings.config(conn, k, tenant=first) for k in settings.every(conn, "", tenant=first)}
    ours = settings.every(conn, "", tenant=new)
    assert ours == {k: v for k, v in theirs.items() if k != "app.staff"}
    assert (
        len(ours)
        >= len(settings.seed("thresholds.json", "thresholds"))
        + len(settings.seed("config.json", "config"))
        - 1
    )
    functions = conn.execute(
        "select p.proname from pg_trigger g join pg_proc p on p.oid = g.tgfoid"
        " where g.tgrelid = 'tenant'::regclass and not g.tgisinternal and p.prosrc ~ '\\minsert into config\\M'"
    ).fetchall()
    assert [f["proname"] for f in functions] == ["school_settings_on_new_school"], (
        "one function seeds settings"
    )
    k2 = conn.execute(
        "select secure_level, secure_days, recheck_days, min_adults from grade where tenant_id = %s and code = 'K2'",
        (new,),
    ).fetchone()
    assert dict(k2) == {"secure_level": 3, "secure_days": 2, "recheck_days": 14, "min_adults": 1}
