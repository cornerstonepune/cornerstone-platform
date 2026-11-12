"""CP-37: MD.A4's date is the school's form in the seed and, by a guarded migration, on a database holding the old words.
Placeholder rows only, in a rolled-back transaction."""

import json
import os
import re
from pathlib import Path

import pytest

from engine.core import db
from tests.rows import tenant

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")

REPO = Path(__file__).resolve().parents[3]
MIGRATION = REPO / "supabase/migrations/20270126150000_cp37_ask_a4_date.sql"
MONTH = "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)"
OLD_WHY = "The school's 24 Jul quiz asks 11 × 4 and 12 × 5; the Grade 4 paper asks 144 ÷ 12."


def _seed():
    return {a["code"]: a for a in json.loads((REPO / "supabase/seed/asks.json").read_text())["asks"]}


@pytest.fixture
def conn():
    with db.connect() as c:
        yield c
        c.rollback()


def _put(c, t, why, answered=False):
    a = _seed()["MD.A4"]
    c.execute("delete from ask where tenant_id = %s and code = 'MD.A4'", (t,))
    c.execute(
        "insert into ask (tenant_id, code, ord, for_role, question, drafted, why, source) values (%s,'MD.A4',0,%s,%s,%s,%s,%s)",
        (t, a["for_role"], a["question"], a["drafted"], why, a["source"]),
    )
    if answered:
        c.execute(
            "update ask set answer = 'agreed', answered_by = 'test', answered_at = '2026-10-15' where tenant_id = %s and code = 'MD.A4'",
            (t,),
        )


def test_the_seed_dates_the_quiz_the_schools_way():
    why = _seed()["MD.A4"]["why"]
    assert "24-Jul-2026" in why and not re.search(rf"\b\d{{1,2}} {MONTH}\b(?!-)", why)


def test_the_migration_rewords_the_old_words_keeps_an_answer_and_leaves_other_words_alone(conn):
    t = tenant(conn)
    _put(conn, t, OLD_WHY, answered=True)
    conn.execute(MIGRATION.read_text())
    row = conn.execute(
        "select why, answer, answered_by from ask where tenant_id = %s and code = 'MD.A4'", (t,)
    ).fetchone()
    assert row["why"] == _seed()["MD.A4"]["why"] and (row["answer"], row["answered_by"]) == ("agreed", "test")
    _put(conn, t, "Their own words, written since.")
    conn.execute(MIGRATION.read_text())
    assert conn.execute("select why from ask where tenant_id = %s and code = 'MD.A4'", (t,)).fetchone()[
        "why"
    ] == ("Their own words, written since.")
