"""CP-27, Done when 15: the timetable of a date is its lessons (`session`); the timetable's rules live in one table; no
table keeps a second copy of a fortnight's periods; no table has a text `week` column, each holds a date. And the
behaviours group 5 moved: a week named by its ISO label is its Monday; a 15-day fortnight's lessons sign as their own; a
fortnight that rolls forward carries the last yes's signature as the next one's baseline. Each test is rolled back."""

import datetime as dt
import uuid

import pytest

from engine.core import db, weeks
from engine.w2_print import fortnight_cycle as fc
from tests import tt_hand_world as tw


@pytest.fixture
def conn():
    with db.connect() as c:
        yield c
        c.rollback()


def _columns(conn, name: str) -> list[tuple[str, str]]:
    return [
        (r["t"], r["data_type"])
        for r in conn.execute(
            "select table_schema || '.' || table_name as t, data_type from information_schema.columns"
            " where table_schema in ('public', 'pii') and column_name = %s"
            " and table_name in (select tablename from pg_tables where schemaname in ('public', 'pii'))",
            (name,),
        ).fetchall()
    ]


def test_no_table_has_a_text_week_column_each_holds_a_date(conn):
    held = _columns(conn, "week")
    assert held and all(kind == "date" for _, kind in held), held


def test_the_rules_live_in_one_table_and_only_the_lessons_hold_a_dated_period(conn):
    """A period of a class's timetable is named by the rules (the week A/B frame: a weekday of a week) and by the dated
    lessons; no other table holds a period, so none keeps a second copy of a fortnight's periods."""
    assert sorted(t for t, _ in _columns(conn, "period_id")) == ["public.session", "public.timetable_rule"]
    kinds = conn.execute(
        "select pg_get_constraintdef(oid) as d from pg_constraint where conrelid = 'timetable_rule'::regclass"
        " and conname = 'timetable_rule_kind_check'"
    ).fetchone()["d"]
    assert all(k in kinds for k in ("'frame'", "'block'", "'limit'")), kinds


def test_the_timetable_of_a_date_is_its_lessons(conn):
    """The educator's day shows the date's lessons, whatever the frame says: a lesson made on a date is shown, and a
    frame cell with no lesson is an empty period."""
    w = tw.school(conn)
    day = tw.START + dt.timedelta(1)
    assert tw.cell(conn, w, day, "p1")["subject"] == "math"
    conn.execute(
        "update session set subject_code = 'art', text = 'Art' where id = %s",
        (tw.session_at(conn, w, day, "p1")["id"],),
    )
    assert (tw.cell(conn, w, day, "p1")["subject"], tw.cell(conn, w, day, "p1")["text"]) == ("art", "Art")
    conn.execute("delete from session where id = %s", (tw.session_at(conn, w, day, "p2")["id"],))
    assert (tw.cell(conn, w, day, "p2")["kind"], tw.cell(conn, w, day, "p2")["subject"]) == ("empty", None)


@pytest.mark.parametrize(
    ("label", "monday"),
    [
        ("2026-W40", dt.date(2026, 9, 28)),
        ("2027-W01", dt.date(2027, 1, 4)),
        ("2026-W53", dt.date(2026, 12, 28)),
    ],
)
def test_a_week_named_by_its_iso_label_is_its_monday_and_back(label, monday):
    assert weeks.day(label) == monday and weeks.label(monday) == label
    assert weeks.day(monday + dt.timedelta(days=4)) == monday


@pytest.mark.parametrize("label", ["Sep W1", "Baseline", "W1", "2027-W53", "2026-W00", ""])
def test_a_label_that_is_no_week_is_refused_never_guessed(label):
    with pytest.raises(weeks.NotAWeek):
        weeks.day(label)
    assert weeks.or_none(label) is None


# ---- CP-7 on the lessons: a 15-day fortnight, and the baseline carried by a fortnight that rolled forward ----


def _standing(conn, w, fid):
    return conn.execute("select * from public.timetable_standing(%s, %s)", (w["class"], fid)).fetchone()


def _fortnight(conn, w, start: dt.date, days: int):
    fid = db.one(
        conn,
        "insert into fortnight (tenant_id, academic_year_id, number, kind, starts_on, ends_on, state)"
        " values (%s, %s, %s, 'teaching', %s, %s, 'frozen') returning id",
        (
            w["tenant"],
            w["year"],
            100000 + uuid.uuid4().int % 800000,
            start,
            start + dt.timedelta(days=days - 1),
        ),
    )["id"]
    conn.execute(
        "insert into school_day (tenant_id, campus_id, on_date, kind) select %s, %s, d, 'teaching'"
        " from generate_series(%s::date, %s::date, '1 day') d where extract(isodow from d) <= 5"
        " on conflict (tenant_id, campus_id, on_date) do update set kind = 'teaching'",
        (w["tenant"], w["campus"], start, start + dt.timedelta(days=days - 1)),
    )
    return fid


def _yes(conn, w, fid):
    """The class's fortnight approved, as `fortnight_approve` writes it (its signature and baseline kept with it); the
    approving group's sign-in is CP-7's proofs' to set up, so the scene is set past the group's guard here."""
    now = _standing(conn, w, fid)
    conn.execute("set local session_replication_role = replica")
    conn.execute(
        "insert into approval (tenant_id, kind, target, decision, by, detail) values (%s, 'timetable', %s, 'approve',"
        " 'staff:test', jsonb_build_object('signature', %s::text, 'baseline', %s::text))",
        (w["tenant"], f"{w['class']} {fid}", now["signature"], now["baseline"]),
    )
    conn.execute("set local session_replication_role = origin")


def test_a_rolled_forward_fortnight_writes_no_yes_and_carries_the_last_yes_as_the_next_ones_baseline(conn):
    w = tw.school(conn)
    first, second, third = (_fortnight(conn, w, tw.START + dt.timedelta(days=14 * k), 14) for k in (1, 2, 3))
    for fid in (first, second, third):
        fc.draft(conn, w["class"], fid, "staff:test")
    assert _standing(conn, w, first)["state"] == "draft"
    _yes(conn, w, first)
    signed = _standing(conn, w, first)
    assert signed["state"] == "approved"
    yeses = conn.execute("select count(*) as n from approval where kind = 'timetable'").fetchone()["n"]
    for fid in (second, third):
        now = _standing(conn, w, fid)
        assert (now["state"], now["baseline"]) == ("rolled_forward", signed["signature"]), now
    assert (
        conn.execute("select count(*) as n from approval where kind = 'timetable'").fetchone()["n"] == yeses
    )
    conn.execute(  # one lesson of the second fortnight changes: it waits for a yes, and the third rolls from the first
        "update session s set subject_code = 'art' from school_day d where d.id = s.school_day_id"
        " and s.school_class_id = %s and d.on_date = %s and s.subject_code = 'math'",
        (w["class"], tw.START + dt.timedelta(days=28)),
    )
    assert _standing(conn, w, second)["state"] == "draft"
    assert (_standing(conn, w, third)["state"], _standing(conn, w, third)["baseline"]) == (
        "rolled_forward",
        signed["signature"],
    )


def test_a_fifteen_day_fortnights_third_monday_signs_as_its_own(conn):
    """A 15-day fortnight has a third Monday: its lessons are drafted and signed as their own day, so a change there is
    a difference and the same lessons on the fortnight's first Monday are not taken for it."""
    w = tw.school(conn)
    long = _fortnight(conn, w, tw.START + dt.timedelta(days=14), 15)
    assert fc.draft(conn, w["class"], long, "staff:test") == "draft"
    third_monday = tw.START + dt.timedelta(days=28)
    lessons = conn.execute(
        "select count(*) as n from session s join school_day d on d.id = s.school_day_id"
        " where s.school_class_id = %s and d.on_date = %s",
        (w["class"], third_monday),
    ).fetchone()["n"]
    assert lessons == 3, (
        "the third Monday got no lessons of its own (week B's Monday cells: circle, maths, English)"
    )
    before = _standing(conn, w, long)["signature"]
    conn.execute(
        "update session s set subject_code = 'art' from school_day d where d.id = s.school_day_id"
        " and s.school_class_id = %s and d.on_date = %s and s.subject_code = 'math'",
        (w["class"], third_monday),
    )
    assert _standing(conn, w, long)["signature"] != before, (
        "a change on the third Monday did not change the signature"
    )
