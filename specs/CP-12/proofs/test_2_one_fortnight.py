"""CP-12 item 2: a move changes only the fortnight it was made in; the same lesson in the fortnights before and after
stays where it was. This holds in a 15-day fortnight too."""

import datetime as dt

import pytest
from conftest import REASON, START, day_view, move, sessions, shown, snapshot, world


def _all_days(conn, w, number):
    return day_view(conn, w, w["fortnights"][number]["dates"])


@pytest.mark.parametrize("days", [14, 15], ids=["14-day", "15-day"])
def test_a_move_changes_only_its_own_fortnight(conn, engine, monkeypatch, days):
    w = world(conn, monkeypatch, days=days)
    on = START + dt.timedelta(days - 1 if days == 15 else 2)  # the repeated Monday of a 15-day fortnight, else a Wednesday
    before = {n: _all_days(conn, w, n) for n in (1, 3)}
    lessons_before = {n: sessions(conn, w, n) for n in (1, 3)}
    same_day = [d for d in w["fortnights"][2]["dates"] if d.isoweekday() == on.isoweekday() and d != on]
    same_before = day_view(conn, w, same_day)
    frame_before = conn.execute("select * from timetable_slot where school_class_id = %s and valid_to is null"
                                " order by id", (w["class"],)).fetchall()

    code, out = move(engine, w, on, "s1", on, "s2", reason=REASON)
    assert code == 0, out

    assert (shown(conn, w, on, "s1")["subject"], shown(conn, w, on, "s2")["subject"]) == ("english", "math")
    assert day_view(conn, w, same_day) == same_before, "the same weekday elsewhere in the fortnight changed"
    for n in (1, 3):
        assert _all_days(conn, w, n) == before[n], f"fortnight {n} changed"
        assert sessions(conn, w, n) == lessons_before[n], f"a lesson of fortnight {n} changed"
    assert conn.execute("select * from timetable_slot where school_class_id = %s and valid_to is null"
                        " order by id", (w["class"],)).fetchall() == frame_before, "the standing frame was edited"


def test_a_move_into_another_fortnight_is_refused_and_writes_nothing(conn, engine, monkeypatch):
    w = world(conn, monkeypatch)
    was = snapshot(conn, w)
    code, out = move(engine, w, START + dt.timedelta(4), "s1", w["fortnights"][3]["start"], "s2", reason=REASON)
    assert code != 0, f"a lesson moved into another fortnight:\n{out}"
    assert snapshot(conn, w) == was, "something was written"
