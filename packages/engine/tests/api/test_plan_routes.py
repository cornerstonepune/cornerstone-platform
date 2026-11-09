"""The coordinator's planning routes (engine/api/routes/plan.py, CP-24): each needs the engine's key and a sign-in on
the staff list, and hands straight to the workflow it stands beside. The routes run on the test's own connection,
rolled back; FET is not run (the draft is a monkeypatched run)."""

import datetime as dt
import os
import uuid

import pytest
from fastapi.testclient import TestClient

from engine.api import deps
from engine.api.app import app
from engine.core import db
from engine.w2_print import fortnight_cycle as fc
from engine.w2_print import tt_generate
from tests.test_fortnight_cycle import a_fortnight

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")
KEY = "test-engine-key"


@pytest.fixture
def engine(monkeypatch):
    monkeypatch.setenv("ENGINE_KEY", KEY)
    with db.connect() as conn:
        app.dependency_overrides[deps.get_conn] = lambda: conn
        try:
            with TestClient(app) as client:
                yield client, conn
        finally:
            app.dependency_overrides.clear()
            conn.rollback()


@pytest.fixture
def world(engine):
    """A staff sign-in of the test's own, and a 2033 teaching fortnight with a cycle row, step settings in order."""
    client, conn = engine
    t = db.one(conn, "select id from tenant where slug = %s", (db.tenant_slug(),))["id"]
    campus = db.one(conn, "select id from campus where tenant_id = %s order by created_at limit 1", (t,))[
        "id"
    ]
    staff = db.one(
        conn, "insert into staff (tenant_id, campus_id) values (%s, %s) returning id", (t, campus)
    )["id"]
    email = f"plan-{uuid.uuid4().hex[:6]}@cornerstone.test"
    conn.execute(
        "insert into pii.staff (staff_id, tenant_id, name, email) values (%s, %s, 'P', %s)", (staff, t, email)
    )
    year = db.one(
        conn,
        "insert into academic_year (tenant_id, label, starts_on, ends_on) values (%s, '2033-34', '2033-06-01',"
        " '2034-03-31') on conflict (tenant_id, label) do update set label = excluded.label returning id",
        (t,),
    )["id"]
    fid = a_fortnight(conn, t, year, "2033-07-11")
    klass = db.one(
        conn,
        "insert into school_class (tenant_id, campus_id, academic_year_id, grade_code, section)"
        " values (%s, %s, %s, 'K2', %s) returning id",
        (t, campus, year, f"P{uuid.uuid4().hex[:6]}"),
    )["id"]
    return client, conn, {"t": t, "staff": staff, "email": email, "fortnight": str(fid), "class": str(klass)}


def _post(client, path, body, key=KEY):
    return client.post(path, json=body, headers={"X-Engine-Key": key} if key else {})


def test_every_route_needs_the_key_and_a_staff_sign_in(world):
    client, conn, w = world
    for path, body in (
        ("/fortnight/state", {"fortnight_id": w["fortnight"]}),
        ("/fortnight/move", {"fortnight_id": w["fortnight"], "to_state": "frozen"}),
        ("/timetable/generate", {"grade": "K2", "section": "A", "year": "2033-34", "fortnight": 1}),
        ("/timetable/link", {}),
        ("/timetable/unmatched", {}),
    ):
        assert _post(client, path, {"actor": w["email"], **body}, key=None).status_code == 401
        r = _post(client, path, {"actor": "nobody@cornerstone.test", **body})
        assert r.status_code == 403, (path, r.json())
    assert (
        db.one(conn, "select state from fortnight_cycle where fortnight_id = %s", (w["fortnight"],))["state"]
        == "planning"
    )


def test_a_fortnight_is_read_and_moved_one_step_at_a_time(world):
    client, conn, w = world
    body = {"actor": w["email"], "fortnight_id": w["fortnight"]}
    r = _post(client, "/fortnight/state", body)
    assert r.status_code == 200, r.json()
    assert r.json()["state"] == "planning" and r.json()["frozen_by"] is None
    assert set(r.json()["step_dates"]) == set(fc.STEPS)
    assert r.json()["step_dates"]["freeze"] == fc.step_date(conn, w["fortnight"], "freeze").isoformat()
    refused = _post(client, "/fortnight/move", {**body, "to_state": "approved"})
    assert refused.status_code == 409 and "frozen" in refused.json()["detail"]
    moved = _post(client, "/fortnight/move", {**body, "to_state": "frozen"})
    assert moved.status_code == 200 and moved.json() == {"state": "frozen"}
    assert _post(client, "/fortnight/state", body).json()["frozen_by"] == str(w["staff"])
    assert _post(client, "/fortnight/state", {**body, "fortnight_id": str(uuid.uuid4())}).status_code == 404
    assert _post(client, "/fortnight/state", {**body, "fortnight_id": "not-an-id"}).status_code == 404


def test_a_draft_is_made_and_kept_as_the_command_keeps_it(world, monkeypatch):
    client, conn, w = world
    seen = []

    def fake_generate(conn, grade, section, year, number):
        seen.append((grade, section, year, number))
        run = tt_generate.Run(
            "unmeetable", 3, 0, {"failed": ["too few free periods"], "rules": []}, seed=1, solve_seconds=5
        )
        run.tenant_id, run.fortnight_id, run.class_id = str(w["t"]), w["fortnight"], w["class"]
        return run

    monkeypatch.setattr(tt_generate, "generate", fake_generate)
    r = _post(
        client,
        "/timetable/generate",
        {"actor": w["email"], "grade": "K2", "section": "A", "year": "2033-34", "fortnight": 7},
    )
    assert r.status_code == 200, r.json()
    assert seen == [("K2", "A", "2033-34", 7)]
    assert r.json()["outcome"] == "unmeetable" and "cannot be met: too few free periods" in r.json()["lines"]
    kept = db.one(
        conn, "select outcome, needed from timetable_run where fortnight_id = %s", (w["fortnight"],)
    )
    assert kept == {"outcome": "unmeetable", "needed": 3}


def test_a_class_or_fortnight_not_there_is_not_found(world):
    client, conn, w = world
    r = _post(
        client,
        "/timetable/generate",
        {
            "actor": w["email"],
            "grade": "K2",
            "section": f"none-{uuid.uuid4().hex[:4]}",
            "year": "2033-34",
            "fortnight": 1,
        },
    )
    assert r.status_code == 404, r.json()
    assert dt.date.today()  # the route takes no clock of its own; nothing else to check here


def test_plan_lines_are_counted_linked_and_listed_when_unmatched(world):
    """CP-8 beside its command: a dry run writes nothing, `apply` makes one run, and a line with no activity is listed
    with its fortnight and reason."""
    client, conn, w = world
    conn.execute(
        "insert into plan_entry (tenant_id, school_class_id, fortnight_id, week_code, plan_key, text, ord, source)"
        " select %s, id, %s, 'A', 'k', 'Nothing matches this', 1, 'CP-24 test' from school_class where id = %s",
        (w["t"], w["fortnight"], w["class"]),
    )
    conn.execute("update school_class set grade_code = 'K2' where id = %s", (w["class"],))
    body = {"actor": w["email"], "band": "K2", "fortnight": None}
    unmatched = _post(client, "/timetable/unmatched", body)
    assert unmatched.status_code == 200, unmatched.json()
    mine = [x for x in unmatched.json()["lines"] if x["text"] == "Nothing matches this"]
    assert mine and mine[0]["reason"] == "no_match" and mine[0]["fortnight"] is not None
    dry = _post(client, "/timetable/link", {**body, "apply": False})
    assert dry.status_code == 200 and dry.json()["run"] is None and dry.json()["fortnights"]
    done = _post(client, "/timetable/link", {**body, "apply": True})
    assert done.status_code == 200 and done.json()["run"]
    nobody = _post(client, "/timetable/link", {**body, "actor": "nobody@cornerstone.test"})
    assert nobody.status_code == 403
