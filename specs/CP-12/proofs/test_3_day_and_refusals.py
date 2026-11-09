"""CP-12 item 3: after a move, the educator's day shows the lesson in its new place with its plan line and its materials
lines. A fixed lesson, a move to or from a day already past or a holiday, or a lesson already marked done or not done
cannot be moved, and the refusal says why and writes nothing."""

import datetime as dt
import re

import pytest
from conftest import (
    REASON,
    START,
    materials,
    move,
    session_at,
    shown,
    snapshot,
    today,
    world,
)

MON, THU = START, START + dt.timedelta(3)


def test_the_day_shows_the_moved_lesson_with_its_plan_line_and_its_materials_lines(conn, engine, monkeypatch):
    w = world(conn, monkeypatch)
    maths, english = session_at(conn, w, MON, "s1"), session_at(conn, w, THU, "s2")
    lines = materials(conn, w, [maths["id"], english["id"]])
    total = conn.execute("select count(*) as n from materials_line_source").fetchone()["n"]

    code, out = move(engine, w, MON, "s1", THU, "s2", reason=REASON)
    assert code == 0, out

    for lesson, d, p in ((maths, THU, "s2"), (english, MON, "s1")):
        seen = shown(conn, w, d, p)
        assert (seen["subject"], seen["plan_entry_id"]) == (lesson["subject_code"], str(lesson["plan_entry_id"])), (
            f"{d} shows {seen['subject']} with plan line {seen['plan_entry_id']}, not the moved {lesson['subject_code']}")
        now = session_at(conn, w, d, p)
        linked = conn.execute("select session_id from materials_line_source where line_id = %s",
                              (lines[lesson["id"]],)).fetchall()
        assert [r["session_id"] for r in linked] == [now["id"]], (
            f"the {lesson['subject_code']} lesson's materials line is not with it on {d}")
    assert conn.execute("select count(*) as n from materials_line_source").fetchone()["n"] == total, "a line was lost"


def _past_world(conn, monkeypatch):
    """A fortnight with days already past and days still to come (today in Asia/Kolkata, the school's zone)."""
    t = today(conn)
    monday = t - dt.timedelta(t.isoweekday() - 1)
    if t.isoweekday() <= 4:
        start = monday - dt.timedelta(7)
        past, future = start, monday + dt.timedelta(4)
    else:
        start = monday
        past, future = start, monday + dt.timedelta(7)
    return world(conn, monkeypatch, start=start, neighbours=False), past, future


def _fixed_from(conn, w):
    return MON, "circle", THU, "s1"


def _fixed_to(conn, w):
    return MON, "s1", THU, "circle"


def _holiday_to(conn, w):
    return MON, "s1", w["holiday"], "s2"


def _holiday_from(conn, w):
    return w["holiday"], "s1", MON, "s2"


def _done_from(conn, w):
    conn.execute("update session set state = 'done' where id = %s", (session_at(conn, w, MON, "s1")["id"],))
    return MON, "s1", THU, "s2"


def _not_done_to(conn, w):
    conn.execute("update session set state = 'not_done' where id = %s", (session_at(conn, w, THU, "s2")["id"],))
    return MON, "s1", THU, "s2"


CASES = {"fixed-lesson": (_fixed_from, r"fixed"), "onto-a-fixed-lesson": (_fixed_to, r"fixed"),
         "to-a-holiday": (_holiday_to, r"holiday"), "from-a-holiday": (_holiday_from, r"holiday"),
         "marked-done": (_done_from, r"done|marked"), "onto-a-lesson-marked-not-done": (_not_done_to, r"done|marked")}


@pytest.mark.parametrize("case", CASES, ids=list(CASES))
def test_a_move_that_may_not_happen_is_refused_with_why_and_writes_nothing(conn, engine, monkeypatch, case):
    w = world(conn, monkeypatch, holiday=START + dt.timedelta(8))  # week B's Tuesday
    make, why = CASES[case]
    frm, fp, to, tp = make(conn, w)
    was = snapshot(conn, w)
    code, out = move(engine, w, frm, fp, to, tp, reason=REASON)
    assert code != 0, f"{case}: the move went through:\n{out}"
    assert re.search(why, out, re.IGNORECASE), f"{case}: the refusal does not say why ({why}):\n{out}"
    assert snapshot(conn, w) == was, f"{case}: something was written"


@pytest.mark.parametrize("direction", ["from-a-past-day", "to-a-past-day"])
def test_a_move_to_or_from_a_day_already_past_is_refused_with_why_and_writes_nothing(conn, engine, monkeypatch,
                                                                                    direction):
    w, past, future = _past_world(conn, monkeypatch)
    frm, to = (past, future) if direction == "from-a-past-day" else (future, past)
    was = snapshot(conn, w)
    code, out = move(engine, w, frm, "s1", to, "s2", reason=REASON)
    assert code != 0, f"{direction}: the move went through:\n{out}"
    assert re.search(r"past", out, re.IGNORECASE), f"{direction}: the refusal does not say the day is past:\n{out}"
    assert snapshot(conn, w) == was, f"{direction}: something was written"
