"""Shared fixtures for CP-6's database proofs (the fortnight cycle; the issue says "month", Nimish decided the fortnight).

Everything is made here, in 2031, inside one transaction that is rolled back: a K2 class of the configured school, a
period, and teaching fortnights with generated numbers. "Who" is `staff:<uuid>` set with `app.changed_by`; no staff or
child name is written. Names used are the design's contract (specs/CP-6/design.md, "Data").
"""

import datetime as dt
import uuid

import psycopg
import pytest

from engine.core import db

WHO = f"staff:{uuid.uuid4()}"  # a staff id, never a name (rule 6)
STATES = ("planning", "frozen", "aligned", "approved", "list_sent")  # each has `<state>_at` and `<state>_by`


@pytest.fixture
def conn():
    with db.connect() as c:
        c.execute("select set_config('app.changed_by', %s, true)", (WHO,))
        c.execute("select set_config('app.change_reason', '', true)")
        yield c
        c.rollback()


@pytest.fixture
def school(conn):
    """The configured school, one of its campuses, a 2031-32 year, a K2 class and a K2 period made for the proof."""
    t = db.one(conn, "select id from tenant where slug = %s", (db.tenant_slug(),))["id"]
    campus = db.one(conn, "select id from campus where tenant_id = %s order by created_at limit 1", (t,))["id"]
    year = db.one(
        conn,
        "insert into academic_year (tenant_id, label, starts_on, ends_on) values (%s, '2031-32', '2031-06-01',"
        " '2032-03-31') on conflict (tenant_id, label) do update set label = excluded.label returning id",
        (t,),
    )["id"]
    klass = db.one(
        conn,
        "insert into school_class (tenant_id, campus_id, academic_year_id, grade_code, section)"
        " values (%s, %s, %s, 'K2', %s) returning id",
        (t, campus, year, f"P6{uuid.uuid4().hex[:6]}"),
    )["id"]
    period = db.one(
        conn,
        "insert into period (tenant_id, grade_code, ord, starts_at, ends_at, label) values (%s, 'K2', 99, '05:55',"
        " '05:59', 'CP-6 proof period') on conflict (tenant_id, grade_code, starts_at) do update"
        " set label = period.label returning id",
        (t,),
    )["id"]
    return {"t": t, "campus": campus, "year": year, "class": klass, "period": period}


def a_fortnight(conn, school, starts_on: str, *, days: int = 14, kind: str = "teaching", cycle: bool = True):
    """A fortnight of `school` from `starts_on`; a teaching one gets its `planning` cycle row unless `cycle` is False."""
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
    return {"id": fid, "starts_on": start, "ends_on": start + dt.timedelta(days=days - 1)}


def move(conn, fortnight_id, state: str) -> None:
    conn.execute("update fortnight_cycle set state = %s where fortnight_id = %s", (state, fortnight_id))


def advance_to(conn, fortnight_id, state: str) -> None:
    """Walk the ladder one step at a time from planning to `state`."""
    for s in STATES[1 : STATES.index(state) + 1]:
        move(conn, fortnight_id, s)


def cycle_row(conn, fortnight_id) -> dict:
    return db.one(conn, "select * from fortnight_cycle where fortnight_id = %s", (fortnight_id,))


def refused(conn, sql: str, params=()) -> str:
    """Run `sql` in a savepoint; it must raise. Returns the database's message."""
    with pytest.raises(psycopg.Error) as e:
        with conn.transaction():
            conn.execute(sql, params)
    return str(e.value)


def with_reason(conn, text: str) -> None:
    conn.execute("select set_config('app.change_reason', %s, true)", (text,))
