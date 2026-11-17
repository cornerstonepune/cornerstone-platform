"""CP-65 (`w2_print/tt_day.py`): a day marked a holiday or an event day, and its lessons then needing a new slot. On the made-up 2033
class of tests/tt_hand_world.py; every test is rolled back."""

import datetime as dt
import os

import pytest
from fastapi.testclient import TestClient

from engine.api import deps
from engine.api.app import app
from engine.core import db
from engine.w2_print import educator_gate as gate
from engine.w2_print import tt_day, tt_delayed
from engine.w2_print.tt_clash import Refused
from tests import tt_hand_world as tw

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")
TODAY = tw.START + dt.timedelta(7)  # week B's Monday
TUESDAY = TODAY + dt.timedelta(
    2
)  # week B's Wednesday: Maths, English and the visiting music lesson (the Tuesday is the world's holiday)


@pytest.fixture
def world(monkeypatch):
    monkeypatch.setattr(gate, "school_today", lambda conn: TODAY)
    with db.connect() as c:
        w = tw.school(c)
        yield c, w
        c.rollback()


def _mark(c, w, on, kind, note=None):
    return tt_day.mark_day(c, w["campus"], on, kind, note, today=TODAY, who=w["staff"]["coordinator"]["id"])


def _needing(c, w):
    return tt_day.needing_a_slot(c, "K2", w["section"], "2033-34")


def test_an_event_day_keeps_its_lessons_and_lists_them_as_needing_a_new_slot(world):
    c, w = world
    out = _mark(c, w, TUESDAY, "event", "Sports day")
    assert out["kind"] == "event" and out["needs_a_slot"] == 3  # Maths, English, music; Circle is fixed
    day = c.execute(
        "select kind, note from school_day where on_date = %s and campus_id = %s", (TUESDAY, w["campus"])
    ).fetchone()
    assert (day["kind"], day["note"]) == ("holiday", "Event: Sports day")
    assert [(r["on_date"], r["ord"]) for r in _needing(c, w)] == [(TUESDAY, 92), (TUESDAY, 93), (TUESDAY, 94)]


def test_a_lesson_needing_a_slot_is_placed_by_hand_through_the_move_checks(world):
    c, w = world
    _mark(c, w, TUESDAY, "holiday", "Diwali")
    sid = _needing(c, w)[0]["session_id"]
    free = TODAY + dt.timedelta(3)
    out = tt_delayed.move_delayed(
        c, "K2", w["section"], "2033-34", [(sid, free, 94)], who=w["staff"]["coordinator"]["id"]
    )
    assert out["count"] == 1 and len(_needing(c, w)) == 2
    with pytest.raises(Refused, match="holiday"):  # a holiday is no place
        tt_delayed.move_delayed(
            c,
            "K2",
            w["section"],
            "2033-34",
            [(_needing(c, w)[0]["session_id"], TUESDAY, 94)],
            who=w["staff"]["coordinator"]["id"],
        )


def test_a_day_gone_by_or_off_the_calendar_or_of_no_such_kind_is_not_marked(world):
    c, w = world
    with pytest.raises(Refused, match="gone by"):
        _mark(c, w, tw.START, "holiday")
    with pytest.raises(Refused, match="no school day"):
        _mark(c, w, TODAY + dt.timedelta(5), "holiday")  # a Saturday
    with pytest.raises(Refused, match="kind of day"):
        _mark(c, w, TUESDAY, "party")


def test_a_day_marked_teaching_again_needs_no_slot(world):
    c, w = world
    _mark(c, w, TUESDAY, "holiday")
    assert _mark(c, w, TUESDAY, "teaching")["needs_a_slot"] == 0 and _needing(c, w) == []


def test_the_route_marks_and_lists(world, monkeypatch):
    c, w = world
    monkeypatch.setenv("ENGINE_KEY", "k")
    app.dependency_overrides[deps.get_conn] = lambda: c
    try:
        cl = TestClient(app, headers={"x-engine-key": "k"})
        who = w["staff"]["coordinator"]["email"]
        body = {"actor": who, "grade": "K2", "section": w["section"], "year": "2033-34"}
        r = cl.post(
            "/timetable/day/mark",
            json={**body, "date": TUESDAY.isoformat(), "kind": "event", "note": "Sports day"},
        )
        assert r.status_code == 200 and r.json()["needs_a_slot"] == 3
        got = cl.post("/timetable/day/needs-slot", json=body).json()
        assert [x["ord"] for x in got] == [92, 93, 94]
        bad = cl.post("/timetable/day/mark", json={**body, "date": tw.START.isoformat(), "kind": "holiday"})
        assert bad.status_code == 409
    finally:
        app.dependency_overrides.pop(deps.get_conn, None)
