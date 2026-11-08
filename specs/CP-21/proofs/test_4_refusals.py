"""CP-21 item 4: a draft whose rules changed since it was made, a draft that did not place every lesson, a fortnight
that has already started, or a date with no school day on record is refused with the reason, and nothing is written.
Putting one fortnight live does not make another fortnight's draft out of date."""

import datetime as dt

from conftest import START, generated, go_live, run_with, snapshot, swapped, world

NO_DAY = START + dt.timedelta(3)  # week A's Thursday, with no school-day row


def _refused(conn, engine, w, run, said):
    was = snapshot(conn, w)
    code, out = go_live(engine, w, run)
    assert code != 0, f"the step went live:\n{out}"
    assert said(out.lower()), f"the reason is not given:\n{out}"
    assert snapshot(conn, w) == was, "something was written"


def test_a_draft_whose_rules_changed_since_it_was_made_is_refused(conn, engine, monkeypatch):
    w = world(conn, monkeypatch)
    run = run_with(conn, generated(conn, engine, w), swapped(w))
    conn.execute("insert into timetable_block (tenant_id, school_class_id, on_date, reason) values (%s, %s, %s,"
                 " 'proof block')", (w["tenant"], w["class"], START + dt.timedelta(2)))
    _refused(conn, engine, w, run, lambda o: "rule" in o)


def test_a_draft_that_did_not_place_every_lesson_is_refused(conn, engine, monkeypatch):
    w = world(conn, monkeypatch)
    run = run_with(conn, generated(conn, engine, w), swapped(w), outcome="unmeetable")
    _refused(conn, engine, w, run, lambda o: "place" in o)


def test_a_fortnight_that_has_already_started_is_refused(conn, engine, monkeypatch):
    today = dt.datetime.now(dt.UTC).date()  # the school's own date is this one or the next
    w = world(conn, monkeypatch, start=today, neighbours=False)
    run = run_with(conn, generated(conn, engine, w), swapped(w))
    _refused(conn, engine, w, run, lambda o: "start" in o)


def test_a_date_with_no_school_day_on_record_is_refused_and_named(conn, engine, monkeypatch):
    w = world(conn, monkeypatch, missing=NO_DAY)
    draft = swapped(w)
    assert any(e["date"] == NO_DAY.isoformat() for e in draft)
    run = run_with(conn, generated(conn, engine, w), draft)
    _refused(conn, engine, w, run, lambda o: NO_DAY.isoformat() in o)


def test_putting_one_fortnight_live_leaves_another_fortnights_draft_current(conn, engine, monkeypatch):
    w = world(conn, monkeypatch)
    second = run_with(conn, generated(conn, engine, w, 2), swapped(w, 2))
    third = run_with(conn, generated(conn, engine, w, 3), swapped(w, 3))
    code, out = go_live(engine, w, second, number=2)
    assert code == 0, out
    code, out = go_live(engine, w, third, number=3)
    assert code == 0, f"fortnight 3's draft was refused after fortnight 2 went live:\n{out}"
