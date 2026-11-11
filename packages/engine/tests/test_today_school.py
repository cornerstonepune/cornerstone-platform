"""CP-28: the coordinator's Today for the school (engine/w3_read/today_school.py). One test per Done-when line of
specs/CP-28/spec.md. Placeholder school rows inside a rolled-back transaction; counts are compared before and after,
since the database may hold other rows."""

import datetime as dt
import os
import uuid

import pytest

from engine.core import db, settings
from engine.w3_read import k2_reads, today_school, voice_store
from tests import materials_rows as mr
from tests.rows import a_child
from tests.test_notes_history_and_coordinator import _coordinator

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")


@pytest.fixture
def conn():
    with db.connect() as c:
        yield c
        c.rollback()


@pytest.fixture
def world(conn):
    s = mr.school(conn)
    k = {"tenant": s["tenant"], "class": s["class"]}
    cfg = k2_reads._cfg(conn)
    last, nxt = today_school._weeks(cfg, settings.school_today(conn))
    return {"s": s, "email": _coordinator(conn, k), "last": last, "next": nxt, "conn": conn}


def _ask(w):
    return today_school.school(w["conn"], w["email"])


def _lesson(conn, s, on, state="planned", planned=True, kind="teaching", activity=None):
    day = conn.execute(
        "insert into school_day (tenant_id, campus_id, on_date, kind) values (%s,%s,%s,%s)"
        " on conflict (tenant_id, campus_id, on_date) do update set kind = excluded.kind returning id",
        (s["tenant"], s["campus"], on, kind),
    ).fetchone()["id"]
    n = s["slot"][on] = s["slot"].get(on, -1) + 1
    plan = None
    if activity:
        plan = conn.execute(
            "insert into plan_entry (tenant_id, school_class_id, fortnight_id, plan_key, ord, text, activity_id,"
            " source) values (%s,%s,%s,%s,%s,'a line',(select id from activity where tenant_id=%s and code=%s),'test')"
            " returning id",
            (s["tenant"], s["class"], s["fortnight"], uuid.uuid4().hex[:8], 1 + n, s["tenant"], activity),
        ).fetchone()["id"]
    conn.execute(
        "insert into session (tenant_id, school_class_id, school_day_id, period_id, planned, state, plan_entry_id,"
        " text) values (%s,%s,%s,%s,%s,%s,%s,'x')",
        (s["tenant"], s["class"], day, s["periods"][n], planned, state, plan),
    )


def test_1_only_a_coordinator_asks(conn, world):
    with pytest.raises(voice_store.Refused) as no:
        today_school.school(conn, "nobody.at.all@example.test")
    assert no.value.status == 403


def test_6_last_week_is_one_cell_per_class_per_day(conn, world):
    s, mon = world["s"], world["last"]
    before = _ask(world)["last_week"]
    _lesson(conn, s, mon, "done")
    _lesson(conn, s, mon + dt.timedelta(days=1), "not_done")
    _lesson(conn, s, mon + dt.timedelta(days=2), "moved")
    _lesson(conn, s, mon + dt.timedelta(days=3), kind="holiday")
    _lesson(conn, s, mon + dt.timedelta(days=4), "done")
    _lesson(conn, s, mon + dt.timedelta(days=4), "planned")  # still unconfirmed: the day is not done
    got = _ask(world)["last_week"]
    mine = {c["day"]: c["state"] for c in got["cells"] if c["section"] == _section(conn, s)}
    assert [mine[mon + dt.timedelta(days=i)] for i in range(5)] == [
        "done",
        "not_done",
        "moved",
        "holiday",
        "not_done",
    ]
    assert (
        got["sessions_planned"] - before["sessions_planned"] == 5
    )  # six lessons, the holiday's is not counted
    assert got["sessions_done"] - before["sessions_done"] == 3  # done, moved, done


def _section(conn, s):
    return conn.execute("select section from school_class where id = %s", (s["class"],)).fetchone()["section"]


def test_3_a_draft_waits_until_someone_puts_it_live(conn, world):
    s = world["s"]
    year = conn.execute("select academic_year_id from school_class where id = %s", (s["class"],)).fetchone()
    start = settings.school_today(conn) + dt.timedelta(days=30)
    fn = conn.execute(
        "insert into fortnight (tenant_id, academic_year_id, number, kind, starts_on, ends_on)"
        " values (%s,%s,911,'teaching',%s,%s) returning id",
        (s["tenant"], year["academic_year_id"], start, start + dt.timedelta(days=13)),
    ).fetchone()["id"]
    run = (
        "insert into timetable_run (tenant_id, school_class_id, fortnight_id, outcome, needed, placed, seed,"
        " solve_seconds) values (%s,%s,%s,'placed',3,3,1,1)"
    )
    conn.execute(run, (s["tenant"], s["class"], fn))
    before = _ask(world)["drafts"]["count"]
    conn.execute(
        run, (s["tenant"], s["class"], fn)
    )  # a newer draft of the same class and fortnight: still one
    got = _ask(world)["drafts"]
    assert got["count"] == before and any(r["fortnight"] == 911 for r in got["rows"])
    conn.execute(
        "insert into approval (tenant_id, kind, target, decision, by, created_at) values (%s,'timetable_live',%s,"
        "'go_live','test',clock_timestamp())",
        (s["tenant"], f"{s['class']} {fn}"),
    )
    assert _ask(world)["drafts"]["count"] == before - 1


def test_5_materials_without_a_quantity_needed_next_week(conn, world):
    s, nxt = world["s"], world["next"]
    before = _ask(world)["materials_no_quantity"]["count"]
    lst = conn.execute(
        "insert into materials_list (tenant_id, school_class_id, period, from_on, to_on) values (%s,%s,'week',%s,%s)"
        " returning id",
        (s["tenant"], s["class"], nxt, nxt + dt.timedelta(days=6)),
    ).fetchone()["id"]
    for qty, on, gone in (
        (None, nxt, None),
        (None, nxt, "now()"),
        (2, nxt, None),
        (None, nxt + dt.timedelta(days=9), None),
    ):
        code = mr.item(conn, s, "thing")
        conn.execute(
            "insert into materials_line (tenant_id, list_id, material_code, unit, quantity, needed_on, activity_code,"
            f" removed_at) values (%s,%s,%s,'piece',%s,%s,%s,{gone or 'null'})",
            (s["tenant"], lst, code, qty, on, s["acts"][0]),
        )
    assert _ask(world)["materials_no_quantity"]["count"] == before + 1  # not removed, none given, in the week


def test_7_consent_counts_children_enrolled_now_whose_latest_answer_is_given(conn, world):
    s = world["s"]
    before = _ask(world)["ready"]
    child = a_child(conn, enrolled=False)
    conn.execute(
        "insert into enrolment (tenant_id, child_id, class_id, roll_no, from_date, recorded_by)"
        " values (%s,%s,%s,'91','2026-01-01','test')",
        (s["tenant"], child, s["class"]),
    )
    ask = lambda: _ask(world)["ready"]  # noqa: E731
    assert (
        ask()["children"] == before["children"] + 1
        and ask()["children_with_consent"] == before["children_with_consent"]
    )
    for decision, extra in (("given", 1), ("withdrawn", 0)):
        conn.execute(
            "insert into consent (tenant_id, child_id, decision, given_by, how, recorded_by) values"
            " (%s,%s,%s,'a parent','in person','test')",
            (s["tenant"], child, decision),
        )
        assert ask()["children_with_consent"] == before["children_with_consent"] + extra


def test_8_activities_and_materials_ready_are_counted_of_all(conn, world):
    s = world["s"]
    before = _ask(world)["ready"]
    code = f"ACT-K2-R{uuid.uuid4().hex[:5]}"
    conn.execute(
        "insert into activity (tenant_id, code, band, strand, name, sheet_no, steps, level_1, level_2, level_3)"
        " values (%s,%s,'K2','Maths','ready one','98','do it','a','b','c')",
        (s["tenant"], code),
    )
    conn.execute(
        "insert into activity (tenant_id, code, band, strand, name, sheet_no, steps, level_1, level_2, level_3)"
        " values (%s,%s,'K2','Maths','half ready','99','do it','a','','c')",
        (s["tenant"], code + "B"),
    )
    mr.needs(conn, s, code, mr.item(conn, s, "x"), 3)
    mr.needs(conn, s, code, mr.item(conn, s, "y"), None, ord_=2)
    got = _ask(world)["ready"]
    assert (got["activities"], got["activities_ready"]) == (
        before["activities"] + 2,
        before["activities_ready"] + 1,
    )
    assert (got["materials"], got["materials_with_quantity"]) == (
        before["materials"] + 2,
        before["materials_with_quantity"] + 1,
    )


def test_9_an_activity_no_lesson_has_used_before_is_new(conn, world):
    s, nxt = world["s"], world["next"]
    fresh, old = s["acts"][0], s["acts"][1]
    _lesson(conn, s, nxt, activity=fresh)
    _lesson(conn, s, nxt + dt.timedelta(days=1), activity=old)
    _lesson(conn, s, world["last"], "done", activity=old)
    codes = [r["code"] for r in _ask(world)["next_week"]["new_activities"]]
    assert fresh in codes and old not in codes


def test_4_and_2_the_late_notes_and_clashes_are_the_pages_own(conn, world):
    got = _ask(world)
    cfg = k2_reads._cfg(conn)
    campus = str(world["s"]["campus"])
    assert got["late_notes"] == k2_reads._counts(conn, cfg, campus)["late"]
    assert got["clashes"] == today_school._clashes(conn, campus, settings.school_today(conn))


def test_10_asking_writes_nothing_and_names_no_one(conn, world):
    tables = ("approval", "change_log", "session", "timetable_run", "materials_line")
    count = lambda: [conn.execute(f"select count(*) as n from {t}").fetchone()["n"] for t in tables]  # noqa: E731
    before = count()
    got = _ask(world)
    assert count() == before
    assert "name" not in str(sorted(got.keys())) and all(k in got for k in ("clashes", "drafts", "ready"))
