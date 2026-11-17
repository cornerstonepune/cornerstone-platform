"""CP-71, Done when 9 at the doors (specs/CP-71/spec.md S3): every write route of the pattern refuses a person outside the coordinators'
group, a sign-in not on the staff list is refused everywhere, and a coordinator is let through. Rolled back; the made-up 2033 school."""

import datetime as dt
import os

import pytest

from engine.core import db
from tests import tt_hand_world as tw
from tests import tt_pattern_world as pw

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")
FROM = "2033-07-18"


@pytest.fixture
def web(monkeypatch):
    from fastapi.testclient import TestClient

    from engine.api import deps
    from engine.api.app import app

    with db.connect() as c:
        w = tw.school(c)
        monkeypatch.setenv("ENGINE_KEY", "k")
        app.dependency_overrides[deps.get_conn] = lambda: (yield c)
        try:
            with TestClient(app, headers={"X-Engine-Key": "k"}) as client:
                yield client, c, w
        finally:
            app.dependency_overrides.clear()
            c.rollback()


def bodies(w):
    p = str(w["period"]["p1"])
    one = {
        "period_id": p,
        "week": "A",
        "weekday": 1,
        "cell": "subject",
        "subject_code": "hindi",
        "text": "Hindi",
    }
    return {
        "change": {"edits": [one]},
        "fill": {"period_id": p, "cell": "subject", "subject_code": "hindi", "text": "Hindi"},
        "copy": {"mode": "week", "from_week": "A", "to_week": "B"},
    }


def test_every_write_route_refuses_a_person_outside_the_group_and_the_pattern_can_still_be_read(web):
    client, c, w = web
    k = str(w["class"])
    teacher, boss, stranger = (
        w["staff"]["educator"]["email"],
        w["staff"]["coordinator"]["email"],
        "nobody@example.test",
    )

    def read(who):
        return client.post("/timetable/pattern/read", json={"actor": who, "class_id": k, "from_date": FROM})

    assert read(teacher).status_code == 200 and len(read(teacher).json()["periods"]) == 4
    assert read(stranger).status_code == 403
    for route, body in bodies(w).items():

        def ask(who, route=route, body=body):
            return client.post(
                f"/timetable/pattern/{route}", json={"actor": who, "class_id": k, "from_date": FROM, **body}
            )

        assert ask(teacher).status_code == 403, route
        assert ask(stranger).status_code == 403, route
        assert ask(boss).status_code == 200, route
    assert pw.cells(c, k, dt.date.fromisoformat(FROM))  # the coordinator's work stood
    other = pw.empty_class(c, w)
    start = {"mode": "start_from", "from_class": k}
    r = client.post(
        "/timetable/pattern/copy", json={"actor": teacher, "class_id": other, "from_date": FROM, **start}
    )
    assert r.status_code == 403
    assert (
        client.post(
            "/timetable/pattern/copy", json={"actor": boss, "class_id": other, "from_date": FROM, **start}
        ).status_code
        == 200
    )


def test_the_check_is_read_by_any_staff_and_allowing_a_problem_is_the_coordinators(
    web,
):  # Done when 9 for the checker's doors
    client, c, w = web
    k = str(w["class"])
    teacher, boss, stranger = (
        w["staff"]["educator"]["email"],
        w["staff"]["coordinator"]["email"],
        "nobody@example.test",
    )
    c.execute(
        "insert into timetable_rule (tenant_id, school_class_id, kind, subject_code, span, most) values (%s, %s, 'limit', 'math', 'week', 4)",
        (w["tenant"], k),
    )
    ask = {"class_ids": [k], "from_date": FROM}
    got = client.post("/timetable/pattern/check", json={"actor": teacher, **ask})
    assert got.status_code == 200 and got.json()["blocking"]
    assert client.post("/timetable/pattern/check", json={"actor": stranger, **ask}).status_code == 403
    key = got.json()["problems"][0]["allow_key"]
    allow = {**ask, "allow_key": key, "reason": "the school keeps five"}
    assert client.post("/timetable/pattern/allow", json={"actor": teacher, **allow}).status_code == 403
    assert client.post("/timetable/pattern/allow", json={"actor": boss, **allow}).status_code == 200
    assert key not in client.post("/timetable/pattern/check", json={"actor": boss, **ask}).json()["blocking"]


def test_the_build_home_is_read_by_any_staff_and_publish_is_the_coordinators(web):  # Done when 9 for publish
    client, c, w = web
    teacher, boss, stranger = (
        w["staff"]["educator"]["email"],
        w["staff"]["coordinator"]["email"],
        "nobody@example.test",
    )
    assert client.post("/timetable/build/home", json={"actor": teacher}).status_code == 200
    assert client.post("/timetable/build/home", json={"actor": stranger}).status_code == 403
    k = pw.empty_class(
        c, w
    )  # a class with no pattern: a coordinator's publish is refused in words, a teacher's by the group first
    ask = {"class_id": k, "fortnight": w["number"], "dry": True}
    assert client.post("/timetable/publish", json={"actor": teacher, **ask}).status_code == 403
    assert client.post("/timetable/publish", json={"actor": stranger, **ask}).status_code == 403
    assert client.post("/timetable/publish", json={"actor": boss, **ask}).status_code == 200


def test_reading_a_pattern_says_which_fortnight_it_would_be_published_as(web):
    """The Build page's Publish button names the fortnight: the first of the class's year with no lessons for the class yet."""
    client, c, w = web
    boss = w["staff"]["coordinator"]["email"]

    def nxt(k):
        r = client.post(
            "/timetable/pattern/read", json={"actor": boss, "class_id": str(k), "from_date": FROM}
        )
        assert r.status_code == 200, r.text
        return r.json()["next_fortnight"]

    assert nxt(w["class"]) is None  # the world's one fortnight already has this class's lessons
    fresh = nxt(pw.empty_class(c, w))
    assert fresh == {
        "number": w["number"],
        "starts_on": tw.START.isoformat(),
        "ends_on": (tw.START + dt.timedelta(days=13)).isoformat(),
    }
