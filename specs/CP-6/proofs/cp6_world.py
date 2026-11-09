"""Shared fixtures for CP-6's database proofs (the fortnight cycle, lean design: the engine enforces, no triggers).

Everything is made here, in 2031, inside one transaction that is rolled back: a K2 class of the configured school, a
staff row (no name), a period, and teaching fortnights with generated numbers. "Who" is a staff id, never a name. Names
used are the design's contract (specs/CP-6/design.md, "Data" and "The engine module").
"""

import datetime as dt
import uuid

import pytest

from engine.core import db

WHO = f"staff:{uuid.uuid4()}"  # a staff id, never a name (rule 6)
STATES = ("planning", "frozen", "aligned", "approved", "list_sent")  # each has `<state>_at` and `<state>_by`


def fc():
    """The module CP-6 creates, imported when a proof runs so a missing module fails that proof, not collection."""
    from engine.w2_print import fortnight_cycle

    return fortnight_cycle


@pytest.fixture
def conn():
    with db.connect() as c:
        yield c
        c.rollback()


@pytest.fixture
def school(conn):
    """The configured school, one of its campuses, a 2031-32 year, a K2 class, a staff row and a K2 period."""
    t = db.one(conn, "select id from tenant where slug = %s", (db.tenant_slug(),))["id"]
    campus = db.one(conn, "select id from campus where tenant_id = %s order by created_at limit 1", (t,))["id"]
    year = db.one(
        conn,
        "insert into academic_year (tenant_id, label, starts_on, ends_on) values (%s, '2031-32', '2031-06-01',"
        " '2032-03-31') on conflict (tenant_id, label) do update set label = excluded.label returning id",
        (t,),
    )["id"]
    section = f"P6{uuid.uuid4().hex[:6]}"
    klass = db.one(
        conn,
        "insert into school_class (tenant_id, campus_id, academic_year_id, grade_code, section)"
        " values (%s, %s, %s, 'K2', %s) returning id",
        (t, campus, year, section),
    )["id"]
    period = db.one(
        conn,
        "insert into period (tenant_id, grade_code, ord, starts_at, ends_at, label) values (%s, 'K2', 99, '05:55',"
        " '05:59', 'CP-6 proof period') on conflict (tenant_id, grade_code, starts_at) do update"
        " set label = period.label returning id",
        (t,),
    )["id"]
    staff = db.one(conn, "insert into staff (tenant_id, campus_id) values (%s, %s) returning id", (t, campus))["id"]
    return {"t": t, "campus": campus, "year": year, "class": klass, "section": section, "period": period,
            "staff": staff}  # fmt: skip


def a_fortnight(conn, school, starts_on: str, *, days: int = 14, kind: str = "teaching", cycle: bool = True):
    """A fortnight of `school` from `starts_on`; a teaching one gets its `planning` cycle row (as the migration's
    backfill gives every teaching fortnight) unless `cycle` is False."""
    start = dt.date.fromisoformat(starts_on)
    number = 100000 + uuid.uuid4().int % 800000 if kind == "teaching" else None
    fid = db.one(
        conn,
        "insert into fortnight (tenant_id, academic_year_id, number, kind, starts_on, ends_on)"
        " values (%s, %s, %s, %s, %s, %s) returning id",
        (school["t"], school["year"], number, kind, start, start + dt.timedelta(days=days - 1)),
    )["id"]
    if cycle and kind == "teaching":
        conn.execute(
            "insert into fortnight_cycle (tenant_id, fortnight_id, state) values (%s, %s, 'planning')"
            " on conflict (fortnight_id) do nothing",
            (school["t"], fid),
        )
    return {"id": fid, "number": number, "starts_on": start, "ends_on": start + dt.timedelta(days=days - 1)}


def advance_to(conn, fortnight_id, state: str, actor: str = WHO) -> None:
    """Walk the ladder one step at a time from planning to `state`, through the engine's `move`."""
    for s in STATES[1 : STATES.index(state) + 1]:
        fc().move(conn, fortnight_id, s, actor)


def cycle_row(conn, fortnight_id) -> dict:
    return db.one(conn, "select * from fortnight_cycle where fortnight_id = %s", (fortnight_id,))


def edits(conn, fortnight_id, kind: str) -> list[dict]:
    return conn.execute(
        "select subject, record_id, op, reason, changed_by, created_at from fortnight_edit"
        " where fortnight_id = %s and kind = %s order by created_at",
        (fortnight_id, kind),
    ).fetchall()


def refused_sql(conn, sql: str, params=()) -> str:
    """Run `sql` in a savepoint; the database must refuse it (a constraint, not a trigger). Returns the message."""
    import psycopg

    with pytest.raises(psycopg.Error) as e:
        with conn.transaction():
            conn.execute(sql, params)
    return str(e.value)
