"""CP-29: the go-live route (engine/api/routes/timetable_hand.py). The rules are CP-22's (tests/test_timetable_go_live.py);
these see that the route reaches them as the person named, refuses as the site needs, and answers what changed."""

import datetime as dt
import json
import os

import pytest
from fastapi.testclient import TestClient

from engine.api import deps
from engine.api.app import app
from engine.w2_print import educator_gate as gate
from engine.w2_print import tt_generate as gen
from tests.test_timetable_go_live import a_run, conn, lives, swapped_draft, world  # noqa: F401

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")
KEY = "test-engine-key"
H = {"X-Engine-Key": KEY}


@pytest.fixture
def client(monkeypatch, conn):  # noqa: F811
    monkeypatch.setenv("ENGINE_KEY", KEY)
    app.dependency_overrides[deps.get_conn] = lambda: conn
    try:
        with TestClient(app) as c:
            yield c
    finally:
        app.dependency_overrides.clear()


def _email(cx, w, staff):
    email = f"placeholder.golive.{staff}@example.test"
    cx.execute(
        "insert into pii.staff (tenant_id, staff_id, name, email) values (%s, %s, 'Placeholder', %s)",
        (w["k"]["tenant"], staff, email),
    )
    return email


def _go(client, w, actor, **extra):
    body = {"actor": actor, "grade": "K2", "section": w["section"], "year": "2031-32", "fortnight": 10}
    return client.post("/timetable/go-live", headers=H, json=body | extra)


def _state(cx):
    return (
        lives(cx),
        cx.execute("select count(*) as n from session").fetchone()["n"],
        cx.execute("select md5(string_agg(id::text || school_day_id::text || period_id::text, ',' order by id))"
                     " as h from session").fetchone()["h"],
    )  # fmt: skip


def test_1_a_stranger_and_a_person_outside_the_group_are_refused_and_nothing_is_written(client, conn, world):  # noqa: F811
    draft, _, _ = swapped_draft(conn, world["i"])
    a_run(conn, world["i"], draft)
    before = _state(conn)
    assert client.post("/timetable/go-live", json={}).status_code == 401
    assert _go(client, world, "nobody@example.org").status_code == 403
    r = _go(client, world, world["k"]["email"])
    assert r.status_code == 409 and "group" in r.json()["detail"]
    assert _state(conn) == before


def test_2_a_trial_run_answers_the_report_and_writes_nothing(client, conn, world):  # noqa: F811
    draft, _, _ = swapped_draft(conn, world["i"])
    a_run(conn, world["i"], draft)
    before = _state(conn)
    r = _go(client, world, _email(conn, world, world["boss"]), dry=True)
    assert r.status_code == 200, r.text
    assert r.json()["dry"] is True and r.json()["moved"] and _state(conn) == before


def test_3_and_4_a_go_live_moves_sessions_in_place_and_lists_exactly_those(client, conn, world):  # noqa: F811
    draft, day, swap = swapped_draft(conn, world["i"])
    run = a_run(conn, world["i"], draft)
    where = lambda: {  # noqa: E731
        str(r["id"]): (r["school_day_id"], r["period_id"])
        for r in conn.execute("select id, school_day_id, period_id from session").fetchall()
    }
    was = where()
    r = _go(client, world, _email(conn, world, world["boss"]))
    assert r.status_code == 200, r.text
    got = r.json()
    now = where()
    assert set(was) <= set(now) and not got["removed"]  # every session kept its id: updated in place
    assert {m["session"] for m in got["moved"]} == {
        s for s in was if was[s] != now[s]
    }  # exactly those that changed
    assert day.isoformat() in {m["from_date"] for m in got["moved"]} and len(swap) == 2
    assert sum(d["moved_here"] for d in got["days"]) == len(got["moved"])
    assert lives(conn) == 1
    row = conn.execute("select \"by\", detail from approval where kind = 'timetable_live'").fetchone()
    assert row["by"] == str(world["boss"]) and row["detail"]["run_id"] == str(run)


@pytest.mark.parametrize("what", ["started", "frozen", "unplaced"])
def test_5_each_refusal_is_a_409_with_its_reason_and_writes_nothing(client, conn, world, monkeypatch, what):  # noqa: F811
    i = world["i"]
    draft, _, _ = swapped_draft(conn, i)
    a_run(conn, i, draft, outcome="unmeetable" if what == "unplaced" else "placed")
    if what == "started":
        monkeypatch.setattr(gate, "school_today", lambda c: dt.date(2027, 1, 1))
    if what == "frozen":
        conn.execute("update fortnight set state = 'frozen' where id = %s", (i.fortnight_id,))
    before = _state(conn)
    r = _go(client, world, _email(conn, world, world["boss"]))
    assert r.status_code == 409 and r.json()["detail"]
    assert _state(conn) == before


def _run_at(cx, i, draft, when, outcome="placed"):
    """A kept draft with its own time: a transaction gives every row the same `now()`, and 'newest' needs a difference."""
    return cx.execute(
        "insert into timetable_run (tenant_id, school_class_id, fortnight_id, outcome, needed, placed, input_text,"
        " fet_version, seed, solve_seconds, draft, created_at) values (%s, %s, %s, %s, 0, 0, %s, 'FET 6.8.5', 1, 1, %s, %s)"
        " returning id",
        (
            i.tenant_id,
            i.class_id,
            i.fortnight_id,
            outcome,
            gen.input_text(i, "FET 6.8.5"),
            json.dumps(draft),
            when,
        ),
    ).fetchone()["id"]


def test_6_the_newest_placed_draft_is_used_when_none_is_named(client, conn, world):  # noqa: F811
    i, draft = world["i"], swapped_draft(conn, world["i"])[0]
    t0 = dt.datetime(2026, 1, 1, tzinfo=dt.UTC)
    _run_at(conn, i, draft, t0)
    newest = _run_at(conn, i, draft, t0 + dt.timedelta(hours=1))
    _run_at(conn, i, draft, t0 + dt.timedelta(hours=2), "unmeetable")  # later, but not placed
    assert _go(client, world, _email(conn, world, world["boss"])).status_code == 200
    row = conn.execute("select detail from approval where kind = 'timetable_live'").fetchone()
    assert row["detail"]["run_id"] == str(newest)


def test_6b_with_no_placed_draft_it_says_so_and_writes_nothing(client, conn, world):  # noqa: F811
    i = world["i"]
    _run_at(conn, i, swapped_draft(conn, i)[0], dt.datetime(2026, 1, 1, tzinfo=dt.UTC), "unmeetable")
    before = _state(conn)
    r = _go(client, world, _email(conn, world, world["boss"]))
    assert r.status_code == 409 and "no placed draft" in r.json()["detail"]
    assert _state(conn) == before
