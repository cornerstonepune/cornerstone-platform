"""The timetable grid's subject colours use the timetable's own subject codes (migration 20270126120000). The migration
brings live's seeded row across, and leaves a row the school has changed alone. Each test rolls back."""

import json
from pathlib import Path

import pytest

from engine.core import db

ROOT = Path(__file__).resolve().parents[3]
MIGRATION = ROOT / "supabase" / "migrations" / "20270126120000_subject_looks_use_the_timetable_codes.sql"
SEED = ROOT / "supabase" / "seed" / "config.json"
OLD = {"NUM": "numeracy", "ENG": "language"}
KEY = "timetable.subject_looks"
needs_db = pytest.mark.skipif(not db.dsn(), reason="needs DATABASE_URL")


def seeded() -> dict:
    rows = json.loads(SEED.read_text())
    rows = rows["config"] if isinstance(rows, dict) else rows
    return next(r["value"] for r in rows if r["key"] == KEY)


def value(conn):
    return conn.execute("select value from config where key = %s", (KEY,)).fetchone()["value"]


def test_the_seed_names_the_timetables_own_codes_and_only_three_looks():
    got = seeded()
    assert got["math"] == "numeracy" and got["english"] == "language" and got["rhymes_dance"] == "language"
    assert set(got.values()) <= {"numeracy", "language"}  # everything else is left to the arts fallback
    assert not set(got) & set(OLD), "the old NUM / ENG keys name no subject the timetable has"


@needs_db
def test_the_migration_moves_the_untouched_seeded_row_to_the_new_codes():
    with db.connect() as conn:
        conn.execute("update config set value = %s::jsonb where key = %s", (json.dumps(OLD), KEY))
        conn.execute(MIGRATION.read_text())
        assert value(conn) == seeded()
        conn.execute(MIGRATION.read_text())  # twice is the same
        assert value(conn) == seeded()
        conn.rollback()


@needs_db
def test_the_migration_leaves_a_row_the_school_changed_alone():
    mine = {"math": "arts", "NUM": "numeracy"}
    with db.connect() as conn:
        conn.execute("update config set value = %s::jsonb where key = %s", (json.dumps(mine), KEY))
        conn.execute(MIGRATION.read_text())
        assert value(conn) == mine
        conn.rollback()
