"""CP-50: K2 children who arrive after 09:00 count as late (migration 20270128110000, seed `attendance.start_times`).
The migration brings live's empty seeded row across and leaves a time the school set alone. Each test rolls back."""

import datetime as dt
import json
from pathlib import Path

import pytest

from engine.core import attendance as at
from engine.core import db
from tests.test_attendance import _row, world  # noqa: F401 — the fixture is used by name

ROOT = Path(__file__).resolve().parents[3]
MIGRATION = ROOT / "supabase" / "migrations" / "20270128110000_cp50_k2_start_time.sql"
SEED = ROOT / "supabase" / "seed" / "config.json"
KEY = "attendance.start_times"
needs_db = pytest.mark.skipif(not db.dsn(), reason="needs DATABASE_URL")


def seeded() -> dict:
    rows = json.loads(SEED.read_text())
    rows = rows["config"] if isinstance(rows, dict) else rows
    return next(r["value"] for r in rows if r["key"] == KEY)


def value(conn):
    return conn.execute("select value from config where key = %s", (KEY,)).fetchone()["value"]


def test_done_when_1_the_seed_starts_k2_at_nine_and_names_no_other_program():
    assert seeded() == {"K2": "09:00"}


@needs_db
def test_done_when_2_the_migration_sets_only_the_untouched_empty_row_and_twice_is_the_same():
    with db.connect() as conn:
        conn.execute("update config set value = '{}'::jsonb where key = %s", (KEY,))
        conn.execute(MIGRATION.read_text())
        assert value(conn) == seeded()
        conn.execute(MIGRATION.read_text())
        assert value(conn) == seeded()
        mine = {"K2": "08:45", "Grade 3": "08:30"}
        conn.execute("update config set value = %s::jsonb where key = %s", (json.dumps(mine), KEY))
        conn.execute(MIGRATION.read_text())
        assert value(conn) == mine, "a time the school set is left alone"
        conn.rollback()


@needs_db
def test_done_when_3_after_nine_is_late_and_nine_exactly_is_not(world):  # noqa: F811
    c, k, child, name = world
    c.execute("update config set value = '{}'::jsonb where key = %s", (KEY,))
    c.execute(MIGRATION.read_text())
    at.load(c, [_row(name, "28 Sept 2026", **{"in": "09:01 AM"}), _row(name, "29 Sept 2026", **{"in": "09:00 AM"})])
    month = at.child(c, str(child), dt.date(2026, 9, 1), dt.date(2026, 9, 30))["months"][0]
    assert (month["present"], month["late"]) == (2, 1)
