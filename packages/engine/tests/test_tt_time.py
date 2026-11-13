"""CP-41 (`w2_print/tt_time.py`, route `/timetable/time`): lesson minutes by subject beside the standing timetable's, on the
made-up 2033 class of tests/tt_hand_world.py (every period 25 minutes; the lessons are the frame's, so each subject is
within its standing time until a test changes a lesson). Each test works in a transaction that is rolled back."""

import datetime as dt
import os
import uuid

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


# Page charter B3 (Time by subject) reads the same route: the minutes a week at a time, and each subject's share of the
# teaching time beside the share the frame rules give it. The world's frame per fortnight: maths and English ten periods
# each, music two (Wednesdays).
WEEK_A, WEEK_B = A, A + dt.timedelta(7)


def _out(c, w, a=A, b=B):
    return tt_time.time_by_subject(c, [w["class"]], a, b)


def test_each_week_has_its_minutes_by_subject_from_the_lessons_held_a_fixed_lesson_none(world):
    c, w = world
    # a fixed lesson that names a subject still gives that subject no minutes
    c.execute(
        "update session set subject_code = 'math' where id = %s", (tw.session_at(c, w, A, "circle")["id"],)
    )
    out = _out(c, w)
    weeks = {x["week_start"]: {s["subject_code"]: s["minutes"] for s in x["subjects"]} for x in out["weeks"]}
    assert list(weeks) == [WEEK_A.isoformat(), WEEK_B.isoformat()]
    assert weeks[WEEK_A.isoformat()] == {"math": 5 * 25, "english": 5 * 25, "music": 25}
    # week B's Tuesday is a holiday: its lessons are not counted
    assert weeks[WEEK_B.isoformat()] == {"math": 4 * 25, "english": 4 * 25, "music": 25}
    assert {r["subject"]: r["minutes"] for r in out["subjects"]} == {"math": 225, "english": 225, "music": 50}


def test_the_target_share_is_the_frames_and_a_timetable_kept_to_it_matches(world):
    c, w = world
    rows = {r["subject"]: r for r in _out(c, w)["subjects"]}
    assert round(sum(r["target_share_pct"] for r in rows.values())) == 100
    for r in rows.values():
        assert r["target_share_pct"] == pytest.approx(r["share_pct"], abs=0.1)


def test_a_subject_the_rules_give_no_time_has_no_target_share_and_none_is_invented(world):
    c, w = world
    c.execute("update session set subject_code = 'art' where id = %s", (tw.session_at(c, w, A, "p2")["id"],))
    art = _rows(c, w)["art"]
    assert art["minutes"] == 25 and art["target_share_pct"] is None and art["status"] == "no_standing_time"
    c.execute("delete from timetable_rule where school_class_id = %s and kind = 'frame'", (w["class"],))
    assert all(r["target_share_pct"] is None for r in _rows(c, w).values())


def test_every_week_of_the_range_is_listed_even_one_with_no_lessons(world):
    c, w = world
    out = _out(c, w, A - dt.timedelta(7), B + dt.timedelta(3))
    assert [x["week_start"] for x in out["weeks"]] == [
        (A + dt.timedelta(7 * n)).isoformat() for n in (-1, 0, 1, 2)
    ]
    assert out["weeks"][0]["subjects"] == [] and out["weeks"][-1]["subjects"] == []


def _second_class(c, w) -> str:
    """Another class of the grade in the same year, with the world class's lessons and frame copied."""
    k = db.one(
        c,
        "insert into school_class (tenant_id, campus_id, academic_year_id, grade_code, section)"
        " values (%s, %s, %s, 'K2', %s) returning id",
        (w["tenant"], w["campus"], w["year"], f"H{uuid.uuid4().hex[:5]}"),
    )["id"]
    c.execute(
        "insert into session (tenant_id, school_class_id, school_day_id, period_id, subject_code, kind, text)"
        " select tenant_id, %s, school_day_id, period_id, subject_code, kind, text from session where school_class_id = %s",
        (k, w["class"]),
    )
    c.execute(
        "insert into timetable_rule (tenant_id, school_class_id, kind, period_id, week_code, weekday, cell, subject_code,"
        " text, valid_from) select tenant_id, %s, kind, period_id, week_code, weekday, cell, subject_code, text,"
        " valid_from from timetable_rule where school_class_id = %s",
        (k, w["class"]),
    )
    return str(k)


@pytest.fixture
def api(world, monkeypatch):
    c, _ = world
    monkeypatch.setenv("ENGINE_KEY", KEY)
    app.dependency_overrides[deps.get_conn] = lambda: (yield c)
    try:
        with TestClient(app) as client:
            yield client
    finally:
        app.dependency_overrides.clear()


def _ask(client, who, **more):
    body = {"actor": who["email"], "start": A.isoformat(), "end": B.isoformat()} | more
    return client.post("/timetable/time", headers={"X-Engine-Key": KEY}, json=body)


def test_the_route_names_the_classes_read_and_a_coordinator_may_read_every_class(world, api):
    c, w = world
    other = _second_class(c, w)
    me = w["staff"]["coordinator"]
    one = _ask(api, me, class_id=str(w["class"]))
    assert one.status_code == 200, one.text
    assert [k["id"] for k in one.json()["read"]] == [str(w["class"])]
    assert {k["id"] for k in one.json()["may_read"]} == {str(w["class"]), other}
    grade = _ask(api, me, grade="K2").json()
    assert {k["id"] for k in grade["read"]} == {str(w["class"]), other}
    assert grade["subjects"][0]["minutes"] == 2 * one.json()["subjects"][0]["minutes"]
    assert len(grade["weeks"]) == 2


def test_an_educator_may_read_her_own_class_only(world, api):
    c, w = world
    other = _second_class(c, w)
    c.execute(
        "insert into config (tenant_id, key, value) values (%s, 'educator.timetable_enabled', 'true')"
        " on conflict (tenant_id, key) do update set value = excluded.value",
        (w["tenant"],),
    )
    me = w["staff"]["educator"]
    mine = _ask(api, me, class_id=str(w["class"]))
    assert mine.status_code == 200, mine.text
    assert [k["id"] for k in mine.json()["may_read"]] == [str(w["class"])]
    assert _ask(api, me, class_id=other).status_code == 403


def test_the_route_works_with_only_the_grants_the_engine_holds_live(world, api):
    """Live the engine reaches the database as `app_engine`; a read it is not granted fails there and nowhere else."""
    c, w = world
    me = w["staff"]["coordinator"]
    owner = _ask(api, me, class_id=str(w["class"])).json()
    c.execute("set local role app_engine")
    engine = _ask(api, me, class_id=str(w["class"]))
    assert engine.status_code == 200, engine.text
    assert engine.json() == owner
