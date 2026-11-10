"""CP-24 items 1 and 2, in the database.

Item 1: `move_child` as the database holds it says no `current_date`, and a hand check the engine writes with no date
is dated `internal.school_day(...)` (CP-27: the column has no default, so nothing dates one by the server's clock).
Item 2: a move made at 01:00 IST (19:30 UTC the day before) opens the new enrolment on that IST day. `move_child` takes
the moment as its 7th parameter, `p_at timestamptz` (specs/CP-24/design.md, "One clock").

The year, classes and children are made here, in 2031, inside a transaction rolled back at the end; no child has a name.
"""

import datetime as dt
import uuid
from zoneinfo import ZoneInfo

from engine.core import db

BY = "proof.coordinator@example.test"
D = dt.date(2031, 7, 14)  # a Monday of the 2031-32 year made below
AT = dt.datetime(2031, 7, 14, 19, 30, tzinfo=dt.UTC)  # 01:00 on 15 Jul 2031 in India


def test_1_move_child_says_no_current_date(conn):
    defs = [r["d"] for r in conn.execute(
        "select pg_get_functiondef(p.oid) as d from pg_proc p join pg_namespace n on n.oid = p.pronamespace"
        " where n.nspname = 'public' and p.proname = 'move_child'"
    ).fetchall()]
    assert defs, "there is no public.move_child"
    assert len(defs) == 1, f"{len(defs)} move_child functions: the old signature was left beside the new one"
    assert "current_date" not in defs[0].lower(), "move_child still takes the date from the server's clock"
    assert "school_day" in defs[0], "move_child does not date the move with internal.school_day"


def test_1_a_hand_check_the_engine_writes_is_dated_by_the_school_day(conn, tenant):
    from engine.w3_read import nightly

    child = db.one(
        conn,
        "insert into child (tenant_id, roll_no, section, band) values (%s, '1', %s, 'G3') returning id",
        (tenant, f"CP24-{uuid.uuid4().hex[:6].upper()}"),
    )["id"]
    nightly.hand_check(conn, child, "NUM.OPS.01", "G3", "secure", BY)
    (row,) = nightly.hand_checks(conn, child)
    assert row["checked_on"] == db.one(conn, "select internal.school_day(%s, now()) as d", (tenant,))["d"]


def _school(conn, tenant):
    """A 2031-32 year, two Grade 3 classes on the school's first campus, child `x` roll 1 of class A, a child in class
    B (a class is one that has a child in it), both enrolled from the year's start."""
    year = db.one(
        conn,
        "insert into academic_year (tenant_id, label, starts_on, ends_on) values (%s, '2031-32', '2031-06-01',"
        " '2032-03-31') on conflict (tenant_id, label) do update set label = excluded.label returning id, starts_on",
        (tenant,),
    )
    campus = db.one(conn, "select id from campus where tenant_id = %s order by created_at limit 1", (tenant,))["id"]
    out = {}
    for name in ("a", "b"):
        section = f"CP24-{uuid.uuid4().hex[:6].upper()}"
        cid = db.one(
            conn,
            "insert into school_class (tenant_id, campus_id, academic_year_id, grade_code, section)"
            " values (%s, %s, %s, 'G3', %s) returning id",
            (tenant, campus, year["id"], section),
        )["id"]
        child = db.one(
            conn,
            "insert into child (tenant_id, roll_no, section, band) values (%s, '1', %s, 'G3') returning id",
            (tenant, section),
        )["id"]
        conn.execute("select enrol_child(%s, %s, '1', %s, %s)", (child, cid, year["starts_on"], BY))
        out[name] = {"section": section, "class": cid, "child": child}
    return out


def test_2_a_move_at_one_in_the_morning_ist_is_dated_that_ist_day(conn, tenant):
    zone = db.one(conn, "select value #>> '{}' as z from config where tenant_id = %s and key = 'school.time_zone'",
                  (tenant,))["z"]
    assert AT.astimezone(ZoneInfo(zone)).date() == D + dt.timedelta(days=1), (
        f"the school's zone is {zone}: this proof is written for India time"
    )
    s = _school(conn, tenant)
    x = s["a"]["child"]
    said = db.one(
        conn,
        "select move_child(%s, 'G3', %s, '2', %s, 'CP-24 proof', %s) as r",
        (x, s["b"]["section"], BY, AT),
    )["r"]
    assert said["moved"] is True, said
    [now] = conn.execute(
        "select class_id, from_date from enrolment where child_id = %s and to_date is null", (x,)
    ).fetchall()
    assert now["class_id"] == s["b"]["class"]
    assert now["from_date"] == D + dt.timedelta(days=1), (
        f"a move at 01:00 IST on {D + dt.timedelta(days=1)} is dated {now['from_date']}"
    )
