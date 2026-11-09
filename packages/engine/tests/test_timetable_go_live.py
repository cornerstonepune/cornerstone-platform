"""CP-22: a placed draft goes live (the locked proofs in specs/CP-22 are the long form; these keep `tt_live` covered by the
engine's own suite). Fortnight 10 of the school's sheet is loaded into a K2 class made for the test, a draft is kept that
swaps two lessons on one day, and everything runs in a transaction that is rolled back."""

import datetime as dt
import json
import os

import pytest

from engine.core import db
from engine.w2_print import educator_gate as gate
from engine.w2_print import k2_day
from engine.w2_print import k2_timetable_sql as sq
from engine.w2_print import tt_generate as gen
from engine.w2_print import tt_live as live
from engine.w2_print import tt_need as need
from tests.test_k2_timetable_load import CAL_CSV, FRAME_CSV, PLANNER_CSV, SPANS, VOCAB, ld
from tests.voice_rows import a_k2_class

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")
LONG_AGO = dt.date(2026, 1, 1)


@pytest.fixture
def conn():
    with db.connect() as c:
        yield c
        c.rollback()


def the_load():
    return ld.build(
        ld.read_frame_csv(FRAME_CSV, VOCAB, SPANS),
        ld.read_planner_csv(PLANNER_CSV, VOCAB),
        ld.read_calendar_csv(CAL_CSV, VOCAB),
        VOCAB, 10, 10,
    )  # fmt: skip


@pytest.fixture
def world(conn, monkeypatch):
    k = a_k2_class(conn)
    section = conn.execute("select section from school_class where id = %s", (k["class"],)).fetchone()[
        "section"
    ]
    sq.apply(conn, the_load(), ld.Target("K2", section, "2031-32", db.tenant_slug()))
    boss = conn.execute(
        "insert into staff (tenant_id, campus_id) select tenant_id, campus_id from staff where id = %s returning id",
        (k["staff"],),
    ).fetchone()["id"]
    conn.execute(
        "insert into staff_role_grant (tenant_id, staff_id, role_code, valid_from, granted_by)"
        " values (%s, %s, 'coordinator', '2026-01-01', 'test')",
        (k["tenant"], boss),
    )
    monkeypatch.setattr(gate, "school_today", lambda c: LONG_AGO)
    return {"k": k, "i": need.load(conn, "K2", section, "2031-32", 10), "boss": boss, "section": section}


def swapped_draft(conn, i):
    """The class's subject lessons as the sessions hold them, with two different subjects on one day swapped."""
    cells = conn.execute(
        "select d.on_date, s.period_id::text as p, s.subject_code from session s join school_day d on d.id = s.school_day_id"
        " where s.school_class_id = %s and s.state = 'planned' order by d.on_date, s.period_id",
        (i.class_id,),
    ).fetchall()
    week = {d.date: d.week for d in i.days}
    subject = [
        c
        for c in cells
        if i.frame.get((week[c["on_date"]], c["on_date"].isoweekday(), c["p"]), ("",))[0] == "subject"
    ]
    first = subject[0]
    other = next(
        c for c in subject if c["on_date"] == first["on_date"] and c["subject_code"] != first["subject_code"]
    )
    swap = {first["p"]: other["subject_code"], other["p"]: first["subject_code"]}
    draft = [
        {"date": c["on_date"].isoformat(), "week": week[c["on_date"]], "period_id": c["p"],
         "subject_code": swap.get(c["p"], c["subject_code"]) if c["on_date"] == first["on_date"] else c["subject_code"]}
        for c in subject
    ]  # fmt: skip
    return draft, first["on_date"], swap


def a_run(conn, i, draft, outcome="placed", text=None):
    return conn.execute(
        "insert into timetable_run (tenant_id, school_class_id, fortnight_id, outcome, needed, placed, input_text,"
        " fet_version, seed, solve_seconds, draft) values (%s, %s, %s, %s, 0, 0, %s, 'FET 6.8.5', 1, 1, %s)"
        " returning id",
        (
            i.tenant_id,
            i.class_id,
            i.fortnight_id,
            outcome,
            text or gen.input_text(i, "FET 6.8.5"),
            json.dumps(draft),
        ),
    ).fetchone()["id"]


def go(conn, w, run, **kw):
    return live.go_live(
        conn, "K2", w["section"], "2031-32", 10, run_id=run, who=kw.pop("who", w["boss"]), **kw
    )


def shown(conn, w, day):
    klass = conn.execute(
        "select id::text as id, academic_year_id, campus_id from school_class where id = %s",
        (w["k"]["class"],),
    ).fetchone()
    return {
        p["period_id"]: p["subject"]
        for p in k2_day.days(conn, klass, [day])[0]["periods"]
        if p["kind"] == "subject"
    }


def lives(conn):
    return conn.execute("select count(*) n from timetable_live").fetchone()["n"]


def test_a_draft_goes_live_the_day_shows_it_and_the_planned_lessons_keep_their_plan_lines(conn, world):
    draft, day, swap = swapped_draft(conn, world["i"])
    run = a_run(conn, world["i"], draft)
    before = {
        r["id"]: r["plan_entry_id"] for r in conn.execute("select id, plan_entry_id from session").fetchall()
    }
    report = go(conn, world, run)
    on_day = shown(conn, world, day)
    assert {p: on_day[p] for p in swap} == swap
    assert any("sessions moved" in line for line in report.lines())
    after = {
        r["id"]: r["plan_entry_id"] for r in conn.execute("select id, plan_entry_id from session").fetchall()
    }
    assert after == before, "a session was lost or lost its plan line"
    row = conn.execute("select * from timetable_live").fetchone()
    assert row["who"] == world["boss"] and row["run_id"] == run and row["discarded"] is False


def test_a_trial_run_writes_nothing(conn, world):
    draft, day, _ = swapped_draft(conn, world["i"])
    was = shown(conn, world, day)
    go(conn, world, a_run(conn, world["i"], draft), dry=True)
    assert shown(conn, world, day) == was and lives(conn) == 0


@pytest.mark.parametrize("what", ["group", "unplaced", "stale", "started", "frozen"])
def test_each_refusal_writes_nothing(conn, world, monkeypatch, what):
    i = world["i"]
    draft, _, _ = swapped_draft(conn, i)
    run = a_run(
        conn,
        i,
        draft,
        outcome="unmeetable" if what == "unplaced" else "placed",
        text="old" if what == "stale" else None,
    )
    kw = {"who": world["k"]["staff"]} if what == "group" else {}
    if what == "started":
        monkeypatch.setattr(gate, "school_today", lambda c: dt.date(2027, 1, 1))
    if what == "frozen":
        conn.execute("update fortnight_cycle set state = 'frozen' where fortnight_id = %s", (i.fortnight_id,))
    with pytest.raises(live.Refused):
        go(conn, world, run, **kw)
    assert lives(conn) == 0


def test_a_frozen_fortnight_goes_live_with_a_reason(conn, world):
    conn.execute(
        "update fortnight_cycle set state = 'frozen' where fortnight_id = %s", (world["i"].fortnight_id,)
    )
    draft, _, _ = swapped_draft(conn, world["i"])
    go(conn, world, a_run(conn, world["i"], draft), reason="the school agreed")
    assert conn.execute("select reason from timetable_live").fetchone()["reason"] == "the school agreed"


def test_a_change_by_hand_is_refused_until_discarded_and_the_loader_keeps_off_a_live_fortnight(conn, world):
    i = world["i"]
    draft, _, _ = swapped_draft(conn, i)
    run = a_run(conn, i, draft)
    go(conn, world, run)
    go(conn, world, run)  # nobody changed it: it goes live again
    conn.execute(
        "update timetable_slot set text = 'by hand' where fortnight_id = %s and kind = 'subject'",
        (i.fortnight_id,),
    )
    with pytest.raises(live.Refused, match="changed since it went live"):
        go(conn, world, run)
    go(conn, world, run, discard=True)
    kept = conn.execute("select discarded from timetable_live order by at").fetchall()
    assert [r["discarded"] for r in kept] == [False, False, True]
    with pytest.raises(sq.LiveFortnight):
        sq.apply(conn, the_load(), ld.Target("K2", world["section"], "2031-32", db.tenant_slug()))
    with pytest.raises(Exception, match="append-only"):
        conn.execute("delete from timetable_live")
