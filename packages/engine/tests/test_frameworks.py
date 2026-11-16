"""CP-54: every framework a learning objective is held against is rows (migration 20270129090000, engine/core/frameworks.py).

The crosswalk (docs/crosswalk/tables, ADR 0041) and the spine (docs/spine/spine.json, ADR 0037) were files the product
never read. These tests load them into the three tables and hold the load to the files: every framework and statement,
the levels' and steps' ages, the school's progressions and profile, and the objectives' links, which are the machine's
(nobody has checked them) and live. Each test rolls back.
"""

import json
import os

import psycopg
import pytest

from engine.core import db, frameworks
from tests.rows import tenant

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")

TABLES = db.REPO_ROOT / "docs" / "crosswalk" / "tables"
SPINE = db.REPO_ROOT / "docs" / "spine" / "spine.json"


def _rows(name):
    return json.loads((TABLES / f"{name}.json").read_text())


@pytest.fixture
def conn():
    with db.connect() as c:
        yield c
        c.rollback()


@pytest.fixture
def loaded(conn):
    t = tenant(conn)
    return conn, t, frameworks.load(conn, t)


def _count(conn, sql, *args):
    return conn.execute(sql, args).fetchone()["n"]


def test_every_framework_and_every_statement_in_the_files_is_a_row(loaded):
    conn, t, _ = loaded
    for f in _rows("framework"):
        assert (
            _count(conn, "select count(*) n from framework where tenant_id = %s and code = %s", t, f["code"])
            == 1
        )
    for s in _rows("framework_statement"):
        row = conn.execute(
            "select kind, text, parent_code from framework_statement where tenant_id = %s and framework_code = %s"
            " and code = %s",
            (t, s["framework_code"], s["code"]),
        ).fetchone()
        assert row == {"kind": s["kind"], "text": s["text"], "parent_code": s["parent_code"]}, s["code"]
    docs = conn.execute(
        "select documents from framework where tenant_id = %s and code = 'NCF-SE-2023'", (t,)
    ).fetchone()["documents"]
    assert [d["sha256"] for d in docs] == [
        d["sha256"] for d in _rows("framework_document") if d["framework_code"] == "NCF-SE-2023"
    ]


def test_every_level_and_every_step_carries_the_ages_its_framework_prints(loaded):
    conn, t, _ = loaded
    for lv in _rows("framework_level"):
        row = conn.execute(
            "select age_from, age_to from framework_statement where tenant_id = %s and framework_code = %s"
            " and code = %s and kind = 'level'",
            (t, lv["framework_code"], lv["code"]),
        ).fetchone()
        assert (float(row["age_from"]), float(row["age_to"])) == (lv["age_from"], lv["age_to"]), lv["code"]
    for st in _rows("progression_step"):
        row = conn.execute(
            "select age_from, parent_code from framework_statement where tenant_id = %s"
            " and framework_code = %s and code = %s and kind = 'step'",
            (t, frameworks.PROGRESSIONS, st["code"]),
        ).fetchone()
        assert float(row["age_from"]) == st["age_from"] and row["parent_code"] == st["progression_code"]


def test_the_schools_profile_holds_the_three_words_in_its_own_words_and_not_the_spines_old_eight_capabilities(
    loaded,
):
    conn, t, _ = loaded
    spine = json.loads(SPINE.read_text())["nodes"]
    for layer, kind, want in (
        ("word", "word", 3),
    ):  # the capabilities are the profile's (tests/test_profile.py)
        nodes = [n for n in spine if n["layer"] == layer]
        assert len(nodes) == want
        for n in nodes:
            row = conn.execute(
                "select text, note from framework_statement where tenant_id = %s and framework_code = %s"
                " and kind = %s and code = %s",
                (t, frameworks.PROFILE, kind, n["id"].split(".", 1)[1]),
            ).fetchone()
            assert row == {"text": n["label"], "note": n["text"]}, n["id"]


def test_the_objectives_links_are_the_machines_live_and_reach_only_objectives_the_school_has(loaded):
    conn, t, counts = loaded
    have = {
        r["code"]
        for r in conn.execute("select code from learning_objective where tenant_id = %s", (t,)).fetchall()
    }
    steps = [r for r in _rows("objective_step") if r["lo_code"] in have]
    assert steps, "the seed holds the G1–G4 objectives the crosswalk placed"
    assert _count(
        conn, "select count(*) n from objective_statement where tenant_id = %s and relation = 'on_step'", t
    ) == len(steps)
    assert (
        _count(
            conn, "select count(*) n from objective_statement where tenant_id = %s and source <> 'machine'", t
        )
        == 0
    )
    assert counts["links_skipped"] == sum(
        1 for name in ("objective_step", "alignment") for r in _rows(name) if r["lo_code"] not in have
    ) + sum(1 for r in _rows("lo_capability") if r["weight"] == "primary" and r["lo_code"] not in have)


def test_an_objective_counts_toward_one_capability_and_sits_on_one_step(loaded):
    conn, t, _ = loaded
    lo = conn.execute(
        "select lo_code from objective_statement where tenant_id = %s and relation = 'on_step' limit 1", (t,)
    ).fetchone()["lo_code"]
    for relation, framework, codes in (
        ("counts_toward", frameworks.PROFILE, ("v2-deep-knowledge", "v2-reasoning")),
        ("on_step", frameworks.PROGRESSIONS, None),
    ):
        if codes is None:
            codes = [
                r["code"]
                for r in conn.execute(
                    "select code from framework_statement where tenant_id = %s and framework_code = %s"
                    " and kind = 'step' and code not in (select statement_code from objective_statement"
                    " where tenant_id = %s and lo_code = %s) limit 2",
                    (t, framework, t, lo),
                ).fetchall()
            ]
        conn.execute("savepoint two")
        with pytest.raises(psycopg.errors.UniqueViolation):
            for c in codes:
                conn.execute(
                    "insert into objective_statement (tenant_id, lo_code, framework_code, statement_code, relation)"
                    " values (%s, %s, %s, %s, %s) on conflict (tenant_id, lo_code, framework_code, statement_code)"
                    " do nothing",
                    (t, lo, framework, c, relation),
                )
        conn.execute("rollback to savepoint two")


def test_loading_twice_changes_nothing_and_never_overwrites_a_persons_link(loaded):
    conn, t, first = loaded
    row = conn.execute(
        "select lo_code, framework_code, statement_code from objective_statement where tenant_id = %s limit 1",
        (t,),
    ).fetchone()
    conn.execute(
        "update objective_statement set source = 'person' where tenant_id = %s and lo_code = %s"
        " and framework_code = %s and statement_code = %s",
        (t, row["lo_code"], row["framework_code"], row["statement_code"]),
    )
    assert frameworks.load(conn, t) == first
    assert (
        conn.execute(
            "select source from objective_statement where tenant_id = %s and lo_code = %s and framework_code = %s"
            " and statement_code = %s",
            (t, row["lo_code"], row["framework_code"], row["statement_code"]),
        ).fetchone()["source"]
        == "person"
    )


def test_links_to_the_spines_old_capabilities_move_to_the_profiles_and_a_persons_stay(loaded):
    conn, t, _ = loaded
    old = conn.execute("select code from framework_statement where kind = 'word' limit 1").fetchone()[
        "code"
    ]  # any row
    del old
    los = [
        r["lo_code"]
        for r in conn.execute(
            "select lo_code from objective_statement where tenant_id = %s and relation = 'on_step' limit 3",
            (t,),
        )
    ]
    conn.execute(
        "delete from objective_statement where tenant_id = %s and relation = 'counts_toward' and lo_code = any(%s)",
        (t, los),
    )
    conn.execute(
        "insert into framework_statement (tenant_id, framework_code, code, kind, text) values"
        " (%s, %s, 'knowledge-and-academic-mastery', 'capability', 'old')",
        (t, frameworks.PROFILE),
    )
    for lo, source in zip(los, ("machine", "person", "machine")):
        conn.execute(
            "insert into objective_statement (tenant_id, lo_code, framework_code, statement_code, relation, source)"
            " values (%s, %s, %s, 'knowledge-and-academic-mastery', 'counts_toward', %s)",
            (t, lo, frameworks.PROFILE, source),
        )
    # the third objective already counts toward a group the CHOOSE run picked: its old link is dropped, not moved
    conn.execute(
        "delete from objective_statement where lo_code = %s and relation = 'counts_toward'", (los[2],)
    )
    group = conn.execute(
        "select code from framework_statement where kind = 'group' and level_code is null limit 1"
    ).fetchone()["code"]
    conn.execute(
        "insert into objective_statement (tenant_id, lo_code, framework_code, statement_code, relation, source)"
        " values (%s, %s, %s, %s, 'counts_toward', 'machine')",
        (t, los[2], frameworks.PROFILE, group),
    )
    frameworks.load(conn, t)
    got = {
        r["lo_code"]: (r["statement_code"], r["source"])
        for r in conn.execute(
            "select lo_code, statement_code, source from objective_statement where tenant_id = %s and relation = 'counts_toward'"
            " and lo_code = any(%s)",
            (t, los),
        )
    }
    assert got[los[1]] == ("knowledge-and-academic-mastery", "person")  # a person's link is never moved
    assert got[los[2]] == (group, "machine")  # the group stays
    assert (
        got[los[0]][0] != "knowledge-and-academic-mastery" and got[los[0]][1] == "machine"
    )  # moved to the profile's own
    assert conn.execute(
        "select 1 from framework_statement where code = 'knowledge-and-academic-mastery'"
    ).fetchone()  # still used
    conn.execute(
        "delete from objective_statement where lo_code = %s and statement_code = 'knowledge-and-academic-mastery'",
        (los[1],),
    )
    frameworks.load(conn, t)
    assert (
        conn.execute(
            "select 1 from framework_statement where code = 'knowledge-and-academic-mastery'"
        ).fetchone()
        is None
    )
    again = frameworks.load(conn, t)
    assert again["links_moved"] == 0  # a second load moves nothing
