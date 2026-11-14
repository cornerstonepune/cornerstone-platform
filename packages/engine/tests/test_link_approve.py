"""CP-51: a person approves what the machine linked (`w1_bank/link_approve.py`, `POST /curriculum/approve`). An approved
link is a person's: it reads "Approved" on the site and a mark on its activity becomes evidence. Placeholder rows
(tests/voice_rows.py), a rolled-back transaction: no school data."""

import os
import uuid

import pytest

from engine.core import db
from engine.w1_bank import link_approve
from tests.voice_rows import a_k2_class

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")


@pytest.fixture
def conn():
    with db.connect() as c:
        yield c
        c.rollback()


def _machine(conn, k) -> tuple[str, str]:
    """A third skill and an objective the machine linked to the activity; returns (skill, objective)."""
    t = k["tenant"]
    skill = conn.execute(
        "select code from registry_skill where tenant_id = %s and code <> all(%s) order by code limit 1",
        (t, k["skills"]),
    ).fetchone()["code"]
    conn.execute(
        "insert into activity_skill (tenant_id, activity_code, skill_code, source) values (%s,%s,%s,'machine')",
        (t, k["activity"], skill),
    )
    lo = f"LO-K2-T{uuid.uuid4().hex[:6]}"
    conn.execute(
        "insert into learning_objective (tenant_id, code, band, subject, unit, title, signal, source)"
        " values (%s,%s,'K2','Maths','Number','Counts to ten','Foundational','machine')",
        (t, lo),
    )
    conn.execute(
        "insert into activity_objective (tenant_id, activity_code, lo_code, ord, source) values (%s,%s,%s,1,'machine')",
        (t, k["activity"], lo),
    )
    conn.execute(
        "insert into learning_objective_skill (tenant_id, lo_code, skill_code, source) values (%s,%s,%s,'machine')",
        (t, lo, skill),
    )
    return skill, lo


def _sources(conn, table, col, code) -> set[tuple[str, str]]:
    other = "skill_code" if table != "activity_objective" else "lo_code"
    return {
        (r["x"], r["source"])
        for r in conn.execute(
            f"select {other} as x, source from {table} where {col} = %s",  # noqa: S608
            (code,),
        )
    }


def test_approving_an_activity_makes_its_machine_links_a_persons_and_leaves_the_schools(conn):
    k = a_k2_class(conn)
    before = _sources(conn, "activity_skill", "activity_code", k["activity"])  # the school's two, as loaded
    skill, lo = _machine(conn, k)
    # a skill link, an objective link, and the objective the machine wrote for it
    assert link_approve.approve(conn, k["tenant"], "activity", k["activity"], k["staff"]) == 3
    assert (
        conn.execute("select source from learning_objective where code = %s", (lo,)).fetchone()["source"]
        == "person"
    )
    assert _sources(conn, "activity_skill", "activity_code", k["activity"]) == before | {(skill, "person")}
    assert _sources(conn, "activity_objective", "activity_code", k["activity"]) == {(lo, "person")}
    assert link_approve.approve(conn, k["tenant"], "activity", k["activity"], k["staff"]) == 0, (
        "twice changes nothing"
    )


def test_approving_an_activity_makes_the_parts_the_machine_drafted_a_persons(conn):
    from engine.w1_bank import k2_part_source

    k = a_k2_class(conn)
    k2_part_source.mark(
        conn, k["tenant"], k["activity"], "steps", "test", None, source="drafted", check_me=True
    )
    assert link_approve.approve(conn, k["tenant"], "activity", k["activity"], k["staff"]) == 1
    now = k2_part_source.now(conn, k["tenant"], k["activity"], "steps")
    assert (now["source"], now["check_me"], str(now["staff_id"])) == ("person", False, str(k["staff"]))


def test_an_approved_skill_is_evidence_from_the_next_mark(conn):
    from engine.w3_read import voice_confirm as vc

    k = a_k2_class(conn)
    skill, _ = _machine(conn, k)
    link_approve.approve(conn, k["tenant"], "activity", k["activity"], k["staff"])
    vc.save_form(conn, k["email"], k["class"], vc.Confirmed(k["activity"], 2, {"above": ["3"]}))
    got = {r["skill_code"] for r in conn.execute(
        "select skill_code from evidence_event where child_id = %s", (k["children"]["3"],))}  # fmt: skip
    assert got == {*k["skills"], skill}


def test_approving_an_objective_makes_it_and_its_machine_skill_links_a_persons(conn):
    k = a_k2_class(conn)
    skill, lo = _machine(conn, k)
    assert (
        link_approve.approve(conn, k["tenant"], "objective", lo, k["staff"]) == 2
    )  # the objective and its one link
    assert _sources(conn, "learning_objective_skill", "lo_code", lo) == {(skill, "person")}
    assert (
        conn.execute("select source from learning_objective where code = %s", (lo,)).fetchone()["source"]
        == "person"
    )
    with pytest.raises(ValueError):
        link_approve.approve(conn, k["tenant"], "lesson", lo, k["staff"])


def test_the_route_approves_after_the_curriculum_gate_and_refuses_a_kind_it_does_not_know(conn, monkeypatch):
    from fastapi.testclient import TestClient

    from engine.api import deps
    from engine.api.app import app
    from engine.api.routes import approve as route

    k = a_k2_class(conn)
    skill, _ = _machine(conn, k)
    monkeypatch.setenv("ENGINE_KEY", "k")
    app.dependency_overrides[deps.get_conn] = lambda: (yield conn)
    asked = []
    monkeypatch.setattr(
        route, "curriculum_staff", lambda c, actor, writes=False: asked.append(writes) or k["staff"]
    )
    try:
        with TestClient(app, headers={"X-Engine-Key": "k"}) as client:
            r = client.post(
                "/curriculum/approve", json={"actor": k["email"], "kind": "activity", "code": k["activity"]}
            )
            assert r.status_code == 200, r.text
            assert r.json() == {"approved": 3}  # its machine skill link, objective link and objective
            bad = client.post(
                "/curriculum/approve", json={"actor": k["email"], "kind": "lesson", "code": "x"}
            )
            assert bad.status_code == 422
            assert asked == [True], "the gate is asked first, as a write"
    finally:
        app.dependency_overrides.clear()
