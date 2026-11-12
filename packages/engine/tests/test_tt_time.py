"""CP-41 (`w2_print/tt_time.py`, route `/timetable/time`): lesson minutes by subject beside the standing timetable's, on the
made-up 2033 class of tests/tt_hand_world.py (every period 25 minutes; the lessons are the frame's, so each subject is
within its standing time until a test changes a lesson). Each test works in a transaction that is rolled back."""

import datetime as dt
import os

import pytest
from fastapi.testclient import TestClient

from engine.api import deps
from engine.api.app import app
from engine.core import db
from engine.w2_print import tt_time
from tests import tt_hand_world as tw

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")
A, B = tw.START, tw.START + dt.timedelta(13)
KEY = "test-engine-key"


@pytest.fixture
def world():
    with db.connect() as c:
        w = tw.school(c)
        yield c, w
        c.rollback()


def _rows(c, w, a=A, b=B):
    return {r["subject"]: r for r in tt_time.time_by_subject(c, [w["class"]], a, b)["subjects"]}


def test_each_subject_has_its_minutes_beside_the_standing_time_and_the_shares_make_a_whole(world):
    c, w = world
    out = tt_time.time_by_subject(c, [w["class"]], A, B)
    rows = {r["subject"]: r for r in out["subjects"]}
    assert set(rows) == {"math", "english", "music"}
    for r in rows.values():
        assert (
            r["minutes"] == 25 * r["lessons"]
            and r["minutes"] == r["standing_minutes"]
            and r["status"] == "within"
        )
    assert out["total_minutes"] == sum(r["minutes"] for r in rows.values())
    assert round(sum(r["share_pct"] for r in rows.values())) == 100


def test_a_holiday_and_days_with_no_lessons_count_on_neither_side(world):
    c, w = world
    base = _rows(c, w)
    wide = _rows(c, w, A - dt.timedelta(60), B + dt.timedelta(60))
    assert {k: (v["minutes"], v["standing_minutes"]) for k, v in wide.items()} == {
        k: (v["minutes"], v["standing_minutes"]) for k, v in base.items()
    }
    assert base["math"]["lessons"] == 9 or base["math"]["lessons"] < 10, "the holiday's lesson is not counted"


def test_dropped_lessons_make_a_subject_short_and_a_lesson_turned_into_it_makes_it_over(world):
    c, w = world
    for d in (A, A + dt.timedelta(1), A + dt.timedelta(2)):
        c.execute("delete from session where id = %s", (tw.session_at(c, w, d, "p1")["id"],))
    c.execute(
        "update session set subject_code = 'english' where id = %s",
        (tw.session_at(c, w, A + dt.timedelta(7), "p1")["id"],),
    )
    rows = _rows(c, w)
    assert rows["math"]["status"] == "short" and rows["english"]["status"] == "over"
    assert rows["music"]["status"] == "within"


def test_the_tolerance_is_the_schools_setting(world):
    c, w = world
    c.execute(
        "update session set subject_code = 'english' where id = %s", (tw.session_at(c, w, A, "p1")["id"],)
    )
    assert _rows(c, w)["english"]["status"] == "over"
    c.execute(
        "insert into config (tenant_id, key, value) values (%s, 'timetable.time_tolerance_pct', '90')"
        " on conflict (tenant_id, key) do update set value = excluded.value",
        (w["tenant"],),
    )
    assert _rows(c, w)["english"]["status"] == "within"


def test_the_route_answers_a_coordinator_for_a_class_or_a_grade_and_refuses_the_rest(world, monkeypatch):
    c, w = world
    monkeypatch.setenv("ENGINE_KEY", KEY)
    h = {"X-Engine-Key": KEY}
    body = {"actor": w["staff"]["coordinator"]["email"], "start": A.isoformat(), "end": B.isoformat()}
    app.dependency_overrides[deps.get_conn] = lambda: c
    try:
        with TestClient(app) as client:
            one = client.post("/timetable/time", headers=h, json=body | {"class_id": str(w["class"])})
            assert one.status_code == 200 and one.json()["classes"] == 1
            assert client.post("/timetable/time", headers=h, json=body | {"grade": "K2"}).status_code == 200
            assert client.post("/timetable/time", headers=h, json=body).status_code == 422
            assert (
                client.post(
                    "/timetable/time", headers=h, json=body | {"class_id": str(w["class"]), "grade": "K2"}
                ).status_code
                == 422
            )
            late = body | {"start": B.isoformat(), "end": A.isoformat(), "class_id": str(w["class"])}
            assert client.post("/timetable/time", headers=h, json=late).status_code == 422
            teacher = body | {"actor": w["staff"]["educator"]["email"], "grade": "K2"}
            assert client.post("/timetable/time", headers=h, json=teacher).status_code in (403,)
    finally:
        app.dependency_overrides.clear()
