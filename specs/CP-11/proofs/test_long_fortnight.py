"""CP-11 item 5: a fortnight longer than two weeks (Fortnight 10 is 15 days) is drafted day by day with no day lost; a
school holiday has no lessons; a kept draft cannot be changed or deleted.

A made-up 15-day fortnight, Monday 11 Aug to Monday 25 Aug 2031: eleven weekdays, one of them (Wednesday 13 Aug) a
school holiday, so ten teaching days. Every weekday's frame is P1 MATH, P2 ENG, P3 empty: MATH and ENG each have ten
lessons in ten days, so each falls once on every teaching day and no day can be left out. 25 Aug is the third Monday,
14 days after the start, so it is week B (the day page's rule).
"""

import datetime as dt

import pytest

from cp11_world import (db, generate, lessons, need_fet, one_run, refused, said, teaching_days, week_of, world)

TWO = (("subject", "MATH"), ("subject", "ENG"), ("empty", None))
START, HOLIDAY, LAST = dt.date(2031, 8, 11), dt.date(2031, 8, 13), dt.date(2031, 8, 25)


@pytest.fixture(scope="module")
def long_run(forgets_what_it_commits):
    need_fet()
    w = world(START, days=15, frame={wd: TWO for wd in range(1, 6)}, holidays=[HOLIDAY])
    out = generate(w)
    assert out.returncode == 0, said(out)
    return w, one_run(w, out)


def test_5_fifteen_days_drafted_day_by_day_no_day_lost_and_the_holiday_empty(long_run):
    w, run = long_run
    days = teaching_days(w)
    assert len(days) == 10 and LAST in days and HOLIDAY not in days  # the proof's own arithmetic
    assert run["outcome"] == "placed" and run["needed"] == run["placed"] == 20, \
        (run["outcome"], run["needed"], run["placed"])
    draft = lessons(run)
    on = {str(lesson["date"]) for lesson in draft}
    assert HOLIDAY.isoformat() not in on, "a lesson on the school holiday"
    assert on == {d.isoformat() for d in days}, f"days lost or added: {sorted({d.isoformat() for d in days} ^ on)}"
    for lesson in draft:
        assert lesson["week"] == week_of(dt.date.fromisoformat(str(lesson["date"])), START), lesson
    assert {lesson["week"] for lesson in draft if str(lesson["date"]) == LAST.isoformat()} == {"B"}


def test_5_a_kept_draft_cannot_be_changed_or_deleted(long_run):
    _, run = long_run
    with db.connect() as c:
        for sql in ("update timetable_run set draft = '[]'::jsonb where id = %s",
                    "update timetable_run set outcome = 'unmeetable' where id = %s",
                    "delete from timetable_run where id = %s"):
            why = refused(c, sql, (run["id"],))
            assert "does not exist" not in why, why
        kept = c.execute("select draft, outcome from timetable_run where id = %s", (run["id"],)).fetchone()
        assert kept["draft"] == run["draft"] and kept["outcome"] == run["outcome"], "the kept run changed"
        c.rollback()
