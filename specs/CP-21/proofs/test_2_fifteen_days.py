"""CP-21 item 2: every date of a 15-day fortnight is live, including a weekday that comes twice; a holiday has no
lessons."""

import datetime as dt

from conftest import (START, day_view, draft_by_date, generated, go_live, lessons, run_with, swapped, teaching,
                      world)

HOLIDAY = START + dt.timedelta(9)  # Wednesday of week B
MONDAY_B, MONDAY_AGAIN = START + dt.timedelta(7), START + dt.timedelta(14)  # week B's Monday, and the 15th day


def test_a_fifteen_day_fortnight_is_live_on_every_date_and_its_holiday_has_no_lessons(conn, engine, monkeypatch):
    w = world(conn, monkeypatch, days=15, holiday=HOLIDAY, neighbours=False)
    draft = swapped(w)
    want = draft_by_date(draft)
    assert want[MONDAY_B.isoformat()] != want[MONDAY_AGAIN.isoformat()], "the two Mondays must differ in the draft"
    assert HOLIDAY.isoformat() not in want
    run = run_with(conn, generated(conn, engine, w), draft)

    code, out = go_live(engine, w, run)
    assert code == 0, out

    days = teaching(w, 2)
    assert MONDAY_AGAIN in days and len(days) == 10
    for d in day_view(conn, w, days):
        assert lessons(d) == want[d["day"]], f"{d['day']}: shown {sorted(lessons(d))}, draft {sorted(want[d['day']])}"
    holiday = day_view(conn, w, [HOLIDAY])[0]
    assert holiday["periods"] == [], "a holiday shows lessons"
    fid = w["fortnights"][2]["id"]
    on = {r["valid_from"]: r["n"] for r in conn.execute(
        "select valid_from, count(*) as n from timetable_slot where fortnight_id = %s group by 1", (fid,)).fetchall()}
    assert HOLIDAY not in on, "the holiday has timetable rows of the fortnight"
    assert MONDAY_AGAIN in on and MONDAY_B in on, "a Monday of week B has no live row"
