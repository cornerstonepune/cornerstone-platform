"""The timetable grid's subject colours use the timetable's own subject codes (migration 20270126120000), and since CP-68 every
lesson head has a look of its own colour (migration 20270201090000). Each migration brings live's seeded row across, and leaves
a row the school has changed alone. Each test rolls back."""

import json
import re
from pathlib import Path

import pytest

from engine.core import db

ROOT = Path(__file__).resolve().parents[3]
MIGRATION = ROOT / "supabase" / "migrations" / "20270126120000_subject_looks_use_the_timetable_codes.sql"
SEED = ROOT / "supabase" / "seed" / "config.json"
CP68 = ROOT / "supabase" / "migrations" / "20270201090000_cp68_subject_looks_one_colour_each.sql"
OLD = {"NUM": "numeracy", "ENG": "language"}
# what the seed held between the two migrations: only maths and the English heads had a look
MID = {
    "math": "numeracy", "english": "language", "hindi": "language", "phonics": "language",
    "reading": "language", "story": "language", "rhymes": "language", "rhymes_dance": "language",
}  # fmt: skip
LOOKS = {"numeracy", "language", "language2", "arts", "music", "movement", "world", "life"}
KEY = "timetable.subject_looks"
needs_db = pytest.mark.skipif(not db.dsn(), reason="needs DATABASE_URL")


def seeded() -> dict:
    rows = json.loads(SEED.read_text())
    rows = rows["config"] if isinstance(rows, dict) else rows
    return next(r["value"] for r in rows if r["key"] == KEY)


def value(conn):
    return conn.execute("select value from config where key = %s", (KEY,)).fetchone()["value"]


def heads() -> set:
    rows = json.loads(SEED.read_text())
    rows = rows["config"] if isinstance(rows, dict) else rows
    return {h["code"] for h in next(r["value"] for r in rows if r["key"] == "timetable.heads")}


def test_the_seed_names_the_timetables_own_codes_and_a_look_the_tokens_hold():
    got = seeded()
    assert got["math"] == "numeracy" and got["english"] == "language" and got["rhymes_dance"] == "language"
    assert set(got.values()) <= LOOKS
    # the looks the site draws are the list in the website's own code (the tokens `subject-<look>` are checked by the browser's u90)
    ts = (ROOT / "apps" / "web" / "lib" / "subject-looks.ts").read_text()
    in_code = set(re.findall(r'"(\w+)"', re.search(r"LOOKS = \[(.*?)\] as const", ts, re.S).group(1)))
    assert in_code == LOOKS, "the migration's looks and the website's LOOKS are one list"
    assert set(got) == heads(), (
        "every lesson head the school has wears a look, and no code names a head it has not"
    )
    # CP-71: Grades 1 to 4 use the subject table's own codes (NUM, ENG...) as heads, so those keys are heads now, not leftovers
    assert {"NUM", "ENG"} <= set(heads()), "Grades 1 to 4 heads are the subject table's codes"


@needs_db
def test_the_migration_moves_the_untouched_seeded_row_to_the_new_codes():
    with db.connect() as conn:
        conn.execute("update config set value = %s::jsonb where key = %s", (json.dumps(OLD), KEY))
        conn.execute(MIGRATION.read_text())
        assert value(conn) == MID
        conn.execute(MIGRATION.read_text())  # twice is the same
        assert value(conn) == MID
        k2 = {
            k: v for k, v in seeded().items() if k.islower()
        }  # CP-71's migration adds the subject-code heads after this one
        conn.execute(CP68.read_text())
        assert value(conn) == k2
        conn.execute(CP68.read_text())  # twice is the same
        assert value(conn) == k2
        conn.rollback()


@needs_db
def test_the_migration_leaves_a_row_the_school_changed_alone():
    mine = {"math": "arts", "NUM": "numeracy"}
    with db.connect() as conn:
        conn.execute("update config set value = %s::jsonb where key = %s", (json.dumps(mine), KEY))
        conn.execute(MIGRATION.read_text())
        assert value(conn) == mine
        conn.execute(CP68.read_text())
        assert value(conn) == mine
        conn.rollback()
