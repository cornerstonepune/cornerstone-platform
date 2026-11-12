"""CP-36: four asks are worded in the school's date and grade words, in the seed and, by the migration, on a database
that holds the old words. Placeholder rows only, inside a rolled-back transaction."""

import json
import os
import re
from pathlib import Path

import pytest

from engine.core import db
from tests.rows import tenant

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")

REPO = Path(__file__).resolve().parents[3]
MIGRATION = REPO / "supabase/migrations/20270126140000_cp36_asks_school_words.sql"
CODES = ("MD.A1", "MD.A6", "MD.A7", "MD.A8")
MONTH = "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)"
GRADE_CODE = re.compile(r"(?<![\w.-])(?:G[1-9]|K[1-3])(?![\w.-])")
ISO_DATE = re.compile(r"(?<![\w-])\d{4}-\d{2}-\d{2}\b")
FIELDS = ("question", "drafted", "why")


def _seed():
    return {a["code"]: a for a in json.loads((REPO / "supabase/seed/asks.json").read_text())["asks"]}


def _old(field_new: str) -> str:
    """The words before CP-36, rebuilt by undoing its six rewordings, so the test needs no copy of the old text."""
    undo = [
        ("09-Oct-2026", "2026-10-09"),
        ("Grade 1 to Grade 4", "G1 to G4"),
        ("Grade 2, Grade 3 and Grade 4", "G2, G3 and G4"),
        ("06-Oct-2026", "2026-10-06"),
    ]
    for new, old in undo:
        field_new = field_new.replace(new, old)
    return field_new


@pytest.fixture
def conn():
    with db.connect() as c:
        yield c
        c.rollback()


def test_the_four_asks_say_dates_and_grades_the_schools_way_in_the_seed():
    for code in CODES:
        for f in FIELDS:
            text = _seed()[code].get(f) or ""
            assert not ISO_DATE.findall(text), (code, f, "a date written as 2026-10-09")
            assert not GRADE_CODE.findall(text), (code, f, "a grade said by its code")
    assert "09-Oct-2026" in _seed()["MD.A1"]["why"] and "06-Oct-2026" in _seed()["MD.A7"]["why"]


def _put(c, t, code, old_fields, answered=False):
    a = _seed()[code]
    c.execute("delete from ask where tenant_id = %s and code = %s", (t, code))
    c.execute(
        "insert into ask (tenant_id, code, ord, for_role, question, drafted, why, source) values (%s,%s,0,%s,%s,%s,%s,%s)",
        (
            t,
            code,
            a["for_role"],
            old_fields["question"],
            old_fields["drafted"],
            old_fields["why"],
            a["source"],
        ),
    )
    if answered:
        c.execute(
            "update ask set answer = 'agreed', answered_by = 'test', answered_at = '2026-10-15' where tenant_id = %s and code = %s",
            (t, code),
        )


def test_the_migration_rewords_rows_holding_the_old_words_and_leaves_an_answer_alone(conn):
    t = tenant(conn)
    for code in CODES:
        seed = _seed()[code]
        old = {f: _old(seed.get(f) or "") if seed.get(f) else None for f in FIELDS}
        old["question"] = seed["question"]
        _put(conn, t, code, old, answered=(code == "MD.A1"))
    conn.execute(MIGRATION.read_text())
    for code in CODES:
        row = conn.execute("select * from ask where tenant_id = %s and code = %s", (t, code)).fetchone()
        seed = _seed()[code]
        assert (row["question"], row["drafted"], row["why"]) == (
            seed["question"],
            seed["drafted"],
            seed.get("why"),
        ), code
        assert (row["answer"] is not None) == (code == "MD.A1"), (
            "an answer is kept, an unanswered row stays unanswered"
        )
    answered = conn.execute(
        "select answer, answered_by from ask where tenant_id = %s and code = 'MD.A1'", (t,)
    ).fetchone()
    assert (answered["answer"], answered["answered_by"]) == ("agreed", "test")


def test_a_row_someone_has_reworded_is_left_alone_and_a_second_run_changes_nothing(conn):
    t = tenant(conn)
    seed = _seed()["MD.A7"]
    mine = {
        "question": seed["question"],
        "drafted": seed["drafted"],
        "why": "Their own words, written since.",
    }
    _put(conn, t, "MD.A7", mine)
    conn.execute(MIGRATION.read_text())
    assert (
        conn.execute("select why from ask where tenant_id = %s and code = 'MD.A7'", (t,)).fetchone()["why"]
        == mine["why"]
    )
    _put(
        conn,
        t,
        "MD.A6",
        {
            f: seed_text
            for f, seed_text in zip(
                FIELDS,
                (_seed()["MD.A6"]["question"], _old(_seed()["MD.A6"]["drafted"]), _seed()["MD.A6"]["why"]),
                strict=True,
            )
        },
    )
    conn.execute(MIGRATION.read_text())
    once = conn.execute(
        "select drafted, updated_at from ask where tenant_id = %s and code = 'MD.A6'", (t,)
    ).fetchone()
    conn.execute(MIGRATION.read_text())
    again = conn.execute(
        "select drafted, updated_at from ask where tenant_id = %s and code = 'MD.A6'", (t,)
    ).fetchone()
    assert once["drafted"] == _seed()["MD.A6"]["drafted"] and again == once


@pytest.mark.parametrize(
    "code, field", [("MD.A1", "why"), ("MD.A6", "drafted"), ("MD.A7", "why"), ("MD.A8", "why")]
)
def test_each_row_reworded_by_someone_since_is_left_alone(conn, code, field):
    t = tenant(conn)
    seed = _seed()[code]
    mine = {f: seed.get(f) for f in FIELDS} | {field: "Their own words, written since."}
    _put(conn, t, code, mine)
    conn.execute(MIGRATION.read_text())
    row = conn.execute(
        "select question, drafted, why from ask where tenant_id = %s and code = %s", (t, code)
    ).fetchone()
    assert (row["question"], row["drafted"], row["why"]) == (mine["question"], mine["drafted"], mine["why"])
