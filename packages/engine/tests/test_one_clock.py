"""One clock (CP-24, audit F5): the school's date is the `school.time_zone` setting's, never the server's.

The text check needs no database: no migration after the audit computes a date from `current_date`, and the zone's
name is written once, in the seed. The behaviour checks run on the test database, rolled back: a child moved at 01:00
in Pune (19:30 UTC the day before) is dated that Pune day, and a hand check with no date is dated by the school's clock.
"""

import datetime as dt
import os
import re
import subprocess
import uuid

import pytest

from engine.core import db, settings
from tests import rows

ROOT = db.REPO_ROOT
MIGRATIONS = ROOT / "supabase" / "migrations"
# The newest migration on main when the audit was answered (CP-6's, which backfills with current_date once, already
# applied: rule 9); every later one keeps to the school's clock
AUDITED = "20270125120000"
ZONE = "Asia/Kolkata"
SOURCE = ("packages/engine/engine", "apps/web/lib", "apps/web/app")


def test_no_migration_after_the_audit_reads_the_servers_date():
    late = sorted(p for p in MIGRATIONS.glob("*.sql") if p.name[:14] > AUDITED)
    assert late, "no migration after the audit: the clock fix is not here"
    hits = [
        f"{p.name}:{n}"
        for p in late
        for n, line in enumerate(p.read_text().splitlines(), 1)
        if re.search(r"\bcurrent_date\b", line.split("--")[0], re.I)  # a comment computes nothing
    ]
    assert hits == [], "a migration computes the school's date from the server's clock:\n" + "\n".join(hits)


def test_the_zone_is_named_once_in_the_seed_and_nowhere_in_the_code():
    files = subprocess.run(
        ["git", "ls-files", *SOURCE], cwd=ROOT, capture_output=True, text=True, check=True
    ).stdout.split()
    assert files, "git listed no source files"
    hits = [f for f in files if ZONE in (ROOT / f).read_text(errors="replace")]
    assert hits == [], "the zone is hard-coded outside the seed:\n" + "\n".join(hits)
    assert ZONE in (ROOT / "supabase" / "seed" / "config.json").read_text()


pytestmark_db = pytest.mark.skipif(
    not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)"
)


@pytest.fixture
def conn():
    with db.connect() as c:
        yield c
        c.rollback()


def _class(conn, t):
    """A year holding 2033, a campus, a G3 class of its own with one child enrolled, roll 1 → (section, class id, child)."""
    year = db.one(
        conn,
        "insert into academic_year (tenant_id, label, starts_on, ends_on) values (%s, '2033-34', '2033-04-01',"
        " '2034-03-31') on conflict (tenant_id, label) do update set label = excluded.label returning id",
        (t,),
    )["id"]
    campus = db.one(conn, "select id from campus where tenant_id = %s order by created_at limit 1", (t,))[
        "id"
    ]
    section = f"CLK-{uuid.uuid4().hex[:6].upper()}"
    klass = db.one(
        conn,
        "insert into school_class (tenant_id, campus_id, academic_year_id, grade_code, section)"
        " values (%s, %s, %s, 'G3', %s) returning id",
        (t, campus, year, section),
    )["id"]
    child = db.one(
        conn,
        "insert into child (tenant_id, roll_no, section, band) values (%s, '1', %s, 'G3') returning id",
        (t, section),
    )["id"]
    conn.execute(
        "insert into enrolment (tenant_id, child_id, class_id, roll_no, from_date, recorded_by)"
        " values (%s, %s, %s, '1', '2033-06-01', 'test')",
        (t, child, klass),
    )
    return section, klass, child


@pytestmark_db
def test_a_move_at_one_in_the_morning_in_pune_is_dated_that_pune_day(conn):
    t = rows.tenant(conn)
    section, klass, child = _class(conn, t)
    at = dt.datetime(2033, 7, 10, 19, 30, tzinfo=dt.UTC)  # 01:00 on 11 July in Pune
    said = db.one(
        conn,
        "select move_child(%s, 'G3', %s, '2', 'coordinator@cornerstone.test', 'clock test', %s) as r",
        (child, section, at),
    )["r"]
    assert said["moved"] is True, said
    opened = db.one(
        conn, "select from_date from enrolment where child_id = %s and to_date is null", (child,)
    )["from_date"]
    assert opened == settings.school_day(conn, at) == dt.date(2033, 7, 11)


@pytestmark_db
def test_a_hand_check_with_no_date_is_dated_by_the_schools_clock(conn):
    t = rows.tenant(conn)
    _, _, child = _class(conn, t)
    row = db.one(
        conn,
        "insert into hand_check (tenant_id, child_id, skill_code, grade_code, expected_state, matches, checked_by)"
        " values (%s, %s, 'S1', 'G3', 'secure', false, 'test') returning checked_on,"
        " internal.school_day(tenant_id, now()) as school_today",
        (t, child),
    )
    assert row["checked_on"] == row["school_today"] == settings.school_today(conn)
    assert not re.search(
        r"current_date", db.one(conn, "select pg_get_functiondef('public.move_child'::regproc) as f")["f"]
    )
