"""The timetable-by-hand routes (engine/api/routes/timetable_hand.py, CP-12): one test per route, on the test's own
transaction, rolled back; a made-up 2033 class (tests/tt_hand_world.py). The rules are tt_move's and tt_clash's: these
tests see that the route reaches them with the person found by email and answers as the website needs."""

import datetime as dt
import os

import pytest
from fastapi.testclient import TestClient

from engine.api import deps
from engine.api.app import app
from engine.core import db
from tests import tt_hand_world as tw

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")
KEY = "test-engine-key"
H = {"X-Engine-Key": KEY}
MON, THU = tw.START, tw.START + dt.timedelta(3)


@pytest.fixture
def engine(monkeypatch):
    monkeypatch.setenv("ENGINE_KEY", KEY)
    with db.connect() as conn:
        app.dependency_overrides[deps.get_conn] = lambda: conn
        try:
            with TestClient(app) as client:
                yield client, conn, tw.school(conn)
        finally:
            app.dependency_overrides.clear()
            conn.rollback()


def _move(client, w, actor, **extra):
    body = {
        "actor": actor, "grade": "K2", "section": w["section"], "year": "2033-34", "from_date": MON.isoformat(),
        "from_period": tw.ORD["p1"], "to_date": THU.isoformat(), "to_period": tw.ORD["p2"], "reason": "Test reason",
    }  # fmt: skip
    return client.post("/timetable/move", headers=H, json=body | extra)


def test_the_move_route_moves_as_the_person_named_and_refuses_a_stranger_or_a_fixed_lesson(engine):
    client, conn, w = engine
    assert client.post("/timetable/move", json={}).status_code == 401, "the engine key is needed"
    assert _move(client, w, "nobody@example.org").status_code == 403
    r = _move(client, w, w["staff"]["coordinator"]["email"])
    assert r.status_code == 200, r.text
    assert r.json()["swapped_with"] == "english" and tw.cell(conn, w, THU, "p2")["subject"] == "math"
    (kept,) = tw.moves(conn, w)
    assert kept["staff_id"] == w["staff"]["coordinator"]["id"]
    refused = _move(client, w, w["staff"]["coordinator"]["email"], to_period=tw.ORD["circle"])
    assert refused.status_code == 409 and "fixed" in refused.json()["detail"]


def test_the_accept_route_accepts_a_clash_for_the_coordinator_group_only(engine):
    client, conn, w = engine
    tw.rule(conn, w, rule="limit", subject_code="math", span="fortnight", most=8)
    (clash,) = conn.execute(
        "select * from timetable_clash where fortnight_id = %s", (w["fortnight"],)
    ).fetchall()
    body = {"actor": w["staff"]["educator"]["email"], "key": clash["clash_key"], "reason": "Test reason"}
    assert client.post("/timetable/clash/accept", json=body).status_code == 401, "the engine key is needed"
    assert client.post("/timetable/clash/accept", headers=H, json=body).status_code == 409
    r = client.post(
        "/timetable/clash/accept", headers=H, json=body | {"actor": w["staff"]["coordinator"]["email"]}
    )
    assert r.status_code == 200, r.text
    assert r.json()["kind"] == "over_limit"
    (now,) = conn.execute(
        "select accepted from timetable_clash where fortnight_id = %s", (w["fortnight"],)
    ).fetchall()
    assert now["accepted"] is True


def test_the_lesson_edit_route_edits_for_the_coordinator_group_only_and_refuses_with_a_reason(engine):
    client, conn, w = engine
    s = tw.session_at(conn, w, MON, "p1")
    body = {"session_id": str(s["id"]), "text": "Counting to 20"}
    assert client.post("/timetable/lesson/edit", json={}).status_code == 401, "the engine key is needed"
    assert (
        client.post(
            "/timetable/lesson/edit", headers=H, json={"actor": "nobody@example.org"} | body
        ).status_code
        == 403
    )
    teacher = client.post(
        "/timetable/lesson/edit", headers=H, json={"actor": w["staff"]["educator"]["email"]} | body
    )
    assert teacher.status_code == 403 and "not in it" in teacher.json()["detail"]
    ok = client.post(
        "/timetable/lesson/edit", headers=H, json={"actor": w["staff"]["coordinator"]["email"]} | body
    )
    assert ok.status_code == 200, ok.text
    assert tw.session_at(conn, w, MON, "p1")["text"] == "Counting to 20"
    refused = client.post(
        "/timetable/lesson/edit", headers=H,
        json={"actor": w["staff"]["coordinator"]["email"], "session_id": str(s["id"]), "subject_code": "zz-none"},
    )  # fmt: skip
    assert refused.status_code == 409 and "not taught" in refused.json()["detail"]
