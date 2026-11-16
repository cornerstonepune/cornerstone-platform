"""CP-59 (`w2_print/tt_delayed.py`, route `/timetable/delayed`): lessons that were delayed, moved to free places of a coming week in
one save. On the made-up 2033 class of tests/tt_hand_world.py, with the school's today set to the second Monday so that the first
week's lessons are past. Each test works in a transaction that is rolled back."""

import datetime as dt
import os

import pytest
from fastapi.testclient import TestClient

from engine.api import deps
from engine.api.app import app
from engine.core import db
from engine.w2_print import educator_gate as gate
from engine.w2_print import tt_delayed
from engine.w2_print.tt_clash import Refused
from tests import tt_hand_world as tw

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")
TODAY = tw.START + dt.timedelta(7)  # week B's Monday: week A is past
FREE = [
    (TODAY, 94),
    (TODAY + dt.timedelta(3), 94),
    (TODAY + dt.timedelta(4), 94),
]  # week B's Monday, Thursday, Friday, period 3


@pytest.fixture
def world(monkeypatch):
    monkeypatch.setattr(gate, "school_today", lambda conn: TODAY)
    with db.connect() as c:
        w = tw.school(c)
        yield c, w
        c.rollback()


def _late(c, w, n=3):
    """The first week's Maths lessons, not taught (planned)."""
    return [str(tw.session_at(c, w, tw.START + dt.timedelta(d), "p1")["id"]) for d in range(n)]


def _move(c, w, moves, reason=None):
    return tt_delayed.move_delayed(
        c, "K2", w["section"], "2033-34", moves, who=w["staff"]["coordinator"]["id"], reason=reason
    )


def _where(c, sid):
    r = c.execute(
        "select d.on_date, p.ord from session s join school_day d on d.id = s.school_day_id join period p on p.id = s.period_id"
        " where s.id::text = %s",
        (sid,),
    ).fetchone()
    return (r["on_date"], r["ord"])


def test_three_delayed_lessons_are_moved_to_three_free_places_in_one_save_each_kept_as_a_move(world):
    c, w = world
    ids = _late(c, w)
    out = _move(c, w, [(i, d, p) for i, (d, p) in zip(ids, FREE, strict=True)], reason="Sports week")
    assert out["count"] == 3
    assert [_where(c, i) for i in ids] == FREE
    moved = tw.moves(c, w)
    assert len(moved) == 3 and {m["reason"] for m in moved} == {"Sports week"}


def test_nothing_ticked_is_refused(world):
    c, w = world
    with pytest.raises(Refused, match="at least one"):
        _move(c, w, [])


def test_one_refusal_takes_back_the_whole_save(world):
    c, w = world
    ids = _late(c, w, 2)
    taken = (TODAY, 93)  # week B's Monday English holds a lesson: not a free place
    before = [_where(c, i) for i in ids]
    with pytest.raises(Refused, match="free place"):
        _move(c, w, [(ids[0], *FREE[0]), (ids[1], *taken)])
    assert [_where(c, i) for i in ids] == before and tw.moves(c, w) == []


def test_a_lesson_taught_or_not_yet_past_or_fixed_is_not_moved(world):
    c, w = world
    one = _late(c, w, 1)[0]
    c.execute("update session set state = 'done' where id::text = %s", (one,))
    with pytest.raises(Refused, match="not taught"):
        _move(c, w, [(one, *FREE[0])])
    ahead = str(tw.session_at(c, w, TODAY, "p1")["id"])
    with pytest.raises(Refused, match="not gone by"):
        _move(c, w, [(ahead, *FREE[1])])
    circle = str(tw.session_at(c, w, tw.START, "circle")["id"])
    with pytest.raises(Refused, match="fixed"):
        _move(c, w, [(circle, *FREE[1])])


def test_a_place_cannot_be_named_twice_and_a_holiday_or_past_day_is_no_place(world):
    c, w = world
    a, b = _late(c, w, 2)
    with pytest.raises(Refused, match="same place"):
        _move(c, w, [(a, *FREE[0]), (b, *FREE[0])])
    with pytest.raises(Refused, match="holiday"):
        _move(c, w, [(a, tw.HOLIDAY, 94)])
    with pytest.raises(Refused, match="past"):
        _move(c, w, [(a, tw.START + dt.timedelta(1), 94)])


def test_the_route_answers_409_and_writes_nothing_on_a_refusal_and_200_when_it_moves(world, monkeypatch):
    c, w = world
    monkeypatch.setenv("ENGINE_KEY", "k")
    h = {"X-Engine-Key": "k"}
    ids = _late(c, w, 2)
    base = {
        "actor": w["staff"]["coordinator"]["email"],
        "grade": "K2",
        "section": w["section"],
        "year": "2033-34",
    }
    mv = [
        {"session_id": i, "to_date": d.isoformat(), "to_period": p}
        for i, (d, p) in zip(ids, FREE, strict=False)
    ]
    app.dependency_overrides[deps.get_conn] = lambda: c
    try:
        with TestClient(app) as client:
            assert client.post("/timetable/delayed", headers=h, json=base | {"moves": []}).status_code == 409
            ok = client.post("/timetable/delayed", headers=h, json=base | {"moves": mv, "reason": "late"})
            assert ok.status_code == 200 and ok.json()["count"] == 2
            outsider = base | {"actor": "nobody@example.org", "moves": mv}
            assert client.post("/timetable/delayed", headers=h, json=outsider).status_code in (403, 404)
    finally:
        app.dependency_overrides.clear()
