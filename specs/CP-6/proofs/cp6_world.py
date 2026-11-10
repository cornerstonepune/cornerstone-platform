"""Shared fixtures for CP-6's database proofs (the fortnight cycle, lean design: the engine enforces). Since CP-27 the
state is `fortnight.state`, each step taken an approval row, and the history the one `change_log`.

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


def a_fortnight(conn, school, starts_on: str, *, days: int = 14, kind: str = "teaching"):
    """A fortnight of `school` from `starts_on`; a teaching one starts at planning (`fortnight.state`, CP-27)."""
    start = dt.date.fromisoformat(starts_on)
    number = 100000 + uuid.uuid4().int % 800000 if kind == "teaching" else None
    fid = db.one(
        conn,
        "insert into fortnight (tenant_id, academic_year_id, number, kind, starts_on, ends_on)"
        " values (%s, %s, %s, %s, %s, %s) returning id",
        (school["t"], school["year"], number, kind, start, start + dt.timedelta(days=days - 1)),
    )["id"]
    return {"id": fid, "number": number, "starts_on": start, "ends_on": start + dt.timedelta(days=days - 1)}


def advance_to(conn, fortnight_id, state: str, actor: str = WHO) -> None:
    """Walk the ladder one step at a time from planning to `state`, through the engine's `move`."""
    for s in STATES[1 : STATES.index(state) + 1]:
        fc().move(conn, fortnight_id, s, actor)


def cycle_row(conn, fortnight_id) -> dict:
    """The fortnight's state and each step's who and when, as the engine reads them (`fortnight_cycle.standing`)."""
    return fc().standing(conn, fortnight_id)


def edits(conn, fortnight_id, kind: str) -> list[dict]:
    """The fortnight's history in the one log (CP-27): its state changes ('state', subject '<from>-><to>'), or the
    changes made after it froze ('frozen_change', subject the table), each with its record, reason, who and when."""
    if kind == "state":
        sql = (
            "select (before ->> 'state') || '->' || (after ->> 'state') as subject, row_id as record_id,"
            " 'state' as op, reason, origin as changed_by, at as created_at from change_log"
            " where table_name = 'fortnight' and row_id = %s and op = 'update' order by at, id"
        )
    else:
        sql = (
            "select table_name as subject, row_id as record_id, op, reason, origin as changed_by, at as created_at"
            " from change_log where after ->> 'fortnight_id' = %s and (after ->> 'frozen')::boolean order by at, id"
        )
    return conn.execute(sql, (str(fortnight_id),)).fetchall()


def refused_sql(conn, sql: str, params=()) -> str:
    """Run `sql` in a savepoint; the database must refuse it (a constraint, not a trigger). Returns the message."""
    import psycopg

    with pytest.raises(psycopg.Error) as e:
        with conn.transaction():
            conn.execute(sql, params)
    return str(e.value)
