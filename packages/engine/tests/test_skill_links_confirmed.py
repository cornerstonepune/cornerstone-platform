"""A prerequisite link between two skills holds its reason and who confirmed it, and nothing reads one nobody confirmed
(goals/m1-15-skill-links.yaml; Nimish, approved 2026-11-04).

Two tables hold links: `skill_link` between the broad skills the evidence and K2's observations point at
(`registry_skill`), and `skill_prerequisite` between the maths micro-steps (`skill`), which gains the same words. Every
reader goes through a view that shows confirmed links only. Staff here are placeholders on the reserved `.invalid`
domain, never a real person.
"""

import os
import re
from pathlib import Path

import pytest

from engine.core import db, english, settings, topics
from engine.w3_read import skill_links
from tests.link_rows import ADD
from tests.link_rows import link as _link
from tests.link_rows import refused as _refused
from tests.link_rows import skills as _skills
from tests.link_rows import staff as _staff
from tests.rows import tenant

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")

ROOT = db.REPO_ROOT
SEEDERS = {"core/english.py", "core/topics.py", "core/loaders.py"}  # the seed loader and the two it calls


@pytest.fixture
def conn():
    with db.connect() as c:
        yield c
        c.rollback()


# ---- Done when 1: the table, and its words (a rule on each column since CP-27) ------------------------------------------------------------------


def test_a_link_between_two_broad_skills_holds_its_strength_reason_source_and_status(conn):
    t = tenant(conn)
    a, b = _skills(conn, 2)
    row = conn.execute(
        ADD + " returning strength, reason, source, status, confirmed_by, confirmed_at",
        (t, b, a, "soft", "Counting comes before adding", "the Grade 1 staff list"),
    ).fetchone()
    assert dict(row) == {
        "strength": "soft",
        "reason": "Counting comes before adding",
        "source": "the Grade 1 staff list",
        "status": "proposed",
        "confirmed_by": None,
        "confirmed_at": None,
    }
    assert _refused(conn, ADD, (t, b, "NOT.A.SKILL", "hard", "r", "s")), "both ends are registry skills"
    assert _refused(conn, ADD, (t, a, a, "hard", "r", "s")), "no skill comes before itself"
    assert _refused(conn, ADD, (t, b, a, "soft", "again", "s")), "one link per pair"
    c = _skills(conn, 3)[2]
    assert _refused(conn, ADD, (t, c, a, "hard", "  ", "s")), "a link says why"
    assert _refused(conn, ADD, (t, c, a, "hard", "r", "  ")), "a link says where it came from"
    assert _refused(conn, ADD, (t, c, a, "firm", "r", "s")), "strength is hard or soft"


def test_a_link_is_proposed_or_confirmed_and_nothing_else(conn):
    """Strength and status are rules on each table's column (CP-27, docs/data-model.md: a short fixed list is a check)."""
    t = tenant(conn)
    a, b = _skills(conn, 2)
    who = _staff(conn, t)
    add = (
        "insert into skill_link (tenant_id, skill_code, before_code, strength, reason, source, status, confirmed_by)"
        " values (%s, %s, %s, 'hard', 'r', 's', %s, %s)"
    )
    assert _refused(conn, add, (t, b, a, "maybe", None)), "a status is proposed or confirmed"
    row = conn.execute("select id from skill_prerequisite limit 1").fetchone()["id"]
    assert _refused(conn, "update skill_prerequisite set strength = 'firm' where id = %s", (row,))
    assert _refused(conn, "update skill_prerequisite set status = 'maybe' where id = %s", (row,))
    assert not _refused(conn, add, (t, b, a, "confirmed", who))


def test_confirmed_needs_a_person_and_a_time_and_proposed_has_neither(conn):
    t = tenant(conn)
    a, b = _skills(conn, 2)
    who = _staff(conn, t)
    add = (
        "insert into skill_link (tenant_id, skill_code, before_code, strength, reason, source, status, confirmed_by)"
        " values (%s, %s, %s, 'hard', 'r', 's', %s, %s)"
    )
    assert _refused(conn, add, (t, b, a, "confirmed", None)), "confirmed by nobody"
    assert _refused(conn, add, (t, b, a, "proposed", who)), "proposed, yet someone confirmed it"
    assert not _refused(conn, add, (t, b, a, "confirmed", who))
    row = conn.execute(
        "select confirmed_at from skill_link where skill_code = %s and before_code = %s", (b, a)
    ).fetchone()
    assert row["confirmed_at"] is not None, "the time is written with the person"


def test_a_link_can_never_be_deleted_by_the_engine_or_the_site(conn):
    for role in ("app_engine", "app_web"):
        assert not conn.execute(
            "select has_table_privilege(%s, 'skill_link', 'DELETE') as ok", (role,)
        ).fetchone()["ok"], f"{role} may delete from skill_link"


# ---- Done when 2: skill_prerequisite gains the same words; the 282 are proposed, never confirmed --------------------


def test_the_micro_step_prerequisites_have_the_same_words_and_none_is_confirmed(conn):
    cols = {
        r["column_name"]
        for r in conn.execute(
            "select column_name from information_schema.columns where table_name = 'skill_prerequisite'"
        )
    }
    assert {"strength", "reason", "source", "status", "confirmed_by", "confirmed_at"} <= cols
    r = conn.execute(
        "select count(*) as n, count(*) filter (where status = 'proposed') as proposed,"
        " count(*) filter (where source = 'seed rule') as from_seed, count(*) filter (where btrim(reason) <> '') as why,"
        " count(*) filter (where confirmed_by is not null or confirmed_at is not null) as confirmed"
        " from skill_prerequisite_audit"
    ).fetchone()
    assert r["n"] == 282
    assert (r["proposed"], r["from_seed"], r["why"], r["confirmed"]) == (282, 282, 282, 0)


def test_the_two_seeders_draw_rows_that_nobody_has_confirmed_and_say_which_seed(conn):
    """The seeds are drafts: the maths one by a grade rule, the English one with the foundation. Neither has been
    checked link by link, so each row they make is proposed, with a source that names the seed."""
    t = tenant(conn)
    conn.execute("delete from skill_prerequisite where tenant_id = %s", (t,))
    topics.prerequisites(conn, t, settings.seed)
    english.prerequisites(conn, t)
    r = conn.execute(
        "select count(*) as n, count(*) filter (where status = 'proposed' and source = 'seed rule'"
        " and btrim(reason) <> '') as ok from skill_prerequisite_audit"
    ).fetchone()
    assert r["n"] == 282 and r["ok"] == 282
    assert conn.execute("select count(*) as n from skill_prerequisite_confirmed").fetchone()["n"] == 0


# ---- Done when 3: views show confirmed links only; no other code reads the raw tables ------------------------------


def test_the_views_show_confirmed_links_only(conn):
    t = tenant(conn)
    a, b, c = _skills(conn, 3)
    who = _staff(conn, t)
    one, two = _link(conn, t, b, a), _link(conn, t, c, b)
    assert conn.execute("select count(*) as n from skill_link_confirmed").fetchone()["n"] == 0
    assert skill_links.confirm(conn, str(one), "checker@school.invalid") == "confirmed"
    assert [r["id"] for r in conn.execute("select id from skill_link_confirmed")] == [one]
    assert two not in [r["id"] for r in conn.execute("select id from skill_link_confirmed")]
    # the micro-steps: one proposed row becomes visible only when a person confirms it
    row = conn.execute("select id from skill_prerequisite limit 1").fetchone()["id"]
    assert conn.execute("select count(*) as n from skill_prerequisite_confirmed").fetchone()["n"] == 0
    assert skill_links.confirm(conn, str(row), "checker@school.invalid") == "confirmed"
    shown = conn.execute("select id, confirmed_by from skill_prerequisite_confirmed").fetchall()
    assert [(r["id"], r["confirmed_by"]) for r in shown] == [(row, who)]


def _readers(roots, pattern, allowed=()):
    """Every source file under `roots` whose text matches `pattern`, apart from those in `allowed` (paths relative to
    their root). Folders nobody writes (node_modules, .next, __pycache__) are not walked."""
    found = []
    for base, exts in roots:
        for here, dirs, files in os.walk(base):
            dirs[:] = [d for d in dirs if d not in {"node_modules", ".next", "__pycache__"}]
            for name in files:
                p = Path(here, name)
                if p.suffix in exts and str(p.relative_to(base)) not in allowed:
                    if pattern.search(p.read_text(encoding="utf-8", errors="ignore")):
                        found.append(str(p))
    return sorted(found)


ROOTS = [
    (ROOT / "packages/engine/engine", {".py"}),
    (ROOT / "apps/web", {".ts", ".tsx", ".js", ".mjs", ".sql"}),
]
# `skill_link_confirmed` and `_audit` are other names (a word boundary does not fall before `_`)
RAW = re.compile(r"\b(skill_link|skill_prerequisite)\b")
AUDIT = re.compile(r"skill_(link|prerequisite)_audit")


def test_no_code_outside_the_views_and_the_seeders_reads_the_raw_link_tables():
    assert _readers(ROOTS, RAW, SEEDERS) == []


def test_only_the_named_checks_read_the_audit_views_which_show_every_status():
    """The audit views show proposed links too. They are for counting and for finding a ring, so a file that reads one
    is named here, and a feature that reads one is a link nobody confirmed being read."""
    allowed = {"checks/links.py", "checks/scenarios_links.py"}
    assert _readers(ROOTS, AUDIT, allowed) == []


def test_the_scan_would_catch_a_reader(tmp_path):
    """A scan that can never fail proves nothing: plant one of each kind and see which it names."""
    (tmp_path / "a.py").write_text('conn.execute("select * from skill_prerequisite")')
    (tmp_path / "b.ts").write_text("from('skill_link').select('*')")
    (tmp_path / "c.py").write_text(
        'conn.execute("select * from skill_link_confirmed, skill_prerequisite_audit")'
    )
    (tmp_path / "seeder.py").write_text('"insert into skill_prerequisite"')
    got = _readers([(tmp_path, {".py", ".ts"})], RAW, {"seeder.py"})
    assert [Path(g).name for g in got] == ["a.py", "b.ts"]


# ---- Done when 4: a cycle among the new links is refused ----------------------------------------------------------


def test_a_cycle_among_links_is_refused_however_long_and_whatever_their_status(conn):
    t = tenant(conn)
    a, b, c, d = _skills(conn, 4)
    _link(conn, t, b, a)
    _link(conn, t, c, b)
    _link(conn, t, d, c)
    assert _refused(conn, ADD, (t, a, d, "soft", "closing the ring", "s")), (
        "a before b before c before d before a"
    )
    assert _refused(conn, ADD, (t, a, b, "hard", "back to back", "s"))
    assert not _refused(conn, ADD, (t, d, a, "hard", "a shortcut is not a ring", "s"))
