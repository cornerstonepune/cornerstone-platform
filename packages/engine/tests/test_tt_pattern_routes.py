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
