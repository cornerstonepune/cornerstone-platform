"""CP-64 (`w1_bank/curriculum_confirm.py`, route `/curriculum/confirm`): a coordinator confirms the machine-made rows of one grade and
subject. Each test works in a transaction that is rolled back, on objectives of its own (a grade band of the test's own, G9)."""

import os
import uuid

import pytest
from fastapi.testclient import TestClient

from engine.api import deps
from engine.api.app import app
from engine.core import db
from engine.w1_bank import curriculum_confirm

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")


@pytest.fixture
def world():
    with db.connect() as c:
        t = db.one(c, "select id from tenant where slug = %s", (db.tenant_slug(),))["id"]
        subj = db.one(c, "select code from subject where tenant_id = %s order by code limit 1", (t,))["code"]
        other = db.one(
            c, "select code from subject where tenant_id = %s and code <> %s order by code limit 1", (t, subj)
        )["code"]
        skill = db.one(c, "select code from registry_skill where tenant_id = %s order by code limit 1", (t,))[
            "code"
        ]
        pre = uuid.uuid4().hex[:6]

        def lo(n: int, subject: str) -> str:
            code = f"LO-C64-{pre}-{n}"
            c.execute(
                "insert into learning_objective (tenant_id, code, band, subject, unit, title, signal, subject_code)"
                " values (%s, %s, 'G9', 'x', 'x', 'x', 'Foundational', %s)",
                (t, code, subject),
            )
            return code

        a, b, out = lo(1, subj), lo(2, subj), lo(3, other)
        act = f"ACT-C64-{pre}"
        c.execute(
            "insert into activity (tenant_id, code, band, strand, name, sheet_no) values (%s, %s, 'G9', 'x', 'x', '1')",
            (t, act),
        )
        for code, src in ((a, "machine"), (b, "school"), (out, "machine")):
            c.execute(
                "insert into activity_objective (tenant_id, activity_code, lo_code, ord, source) values (%s, %s, %s, 1, %s)",
                (t, act, code, src),
            )
        c.execute(
            "insert into learning_objective_skill (tenant_id, lo_code, skill_code, source) values (%s, %s, %s, 'machine')",
            (t, a, skill),
        )
        coord = db.one(
            c,
            "insert into staff (tenant_id, campus_id) select %s, id from campus where tenant_id = %s limit 1 returning id",
            (t, t),
        )["id"]
        email = f"coord-{pre}@example.org"
        c.execute(
            "insert into pii.staff (tenant_id, staff_id, name, email) values (%s, %s, 'Test Person', %s)",
            (t, coord, email),
        )
        c.execute(
            "insert into staff_role_grant (tenant_id, staff_id, role_code, valid_from, granted_by) values (%s, %s, 'coordinator', '2026-01-01', 'test')",
            (t, coord),
        )
        edu = db.one(
            c,
            "insert into staff (tenant_id, campus_id) select %s, id from campus where tenant_id = %s limit 1 returning id",
            (t, t),
        )["id"]
        eemail = f"edu-{pre}@example.org"
        c.execute(
            "insert into pii.staff (tenant_id, staff_id, name, email) values (%s, %s, 'Other Person', %s)",
            (t, edu, eemail),
        )
        yield (
            c,
            {
                "t": t,
                "subj": subj,
                "other": other,
                "a": a,
                "b": b,
                "out": out,
                "coord": coord,
                "email": email,
                "edu": edu,
                "eemail": eemail,
            },
        )
        c.rollback()


def _src(c, table, lo):
    return [
        r["source"] for r in c.execute(f"select source from {table} where lo_code = %s", (lo,)).fetchall()
    ]  # noqa: S608


def test_a_batch_of_one_grade_and_subject_moves_from_machine_to_person_with_one_approval_and_touches_nothing_else(
    world,
):
    c, w = world
    out = curriculum_confirm.confirm(c, w["coord"], w["email"], "G9", w["subj"])
    assert out == {"changed": 2, "links": 1, "skills": 1, "statements": 0}
    assert _src(c, "activity_objective", w["a"]) == ["person"] and _src(
        c, "learning_objective_skill", w["a"]
    ) == ["person"]
    assert _src(c, "activity_objective", w["b"]) == ["school"]  # the school's own stays the school's
    assert _src(c, "activity_objective", w["out"]) == ["machine"]  # another subject's stays
    rows = c.execute(
        "select kind, target, decision, by, detail from approval where target like %s", (f"G9~{w['subj']}~%",)
    ).fetchall()
    assert len(rows) == 1
    assert (rows[0]["kind"], rows[0]["decision"], rows[0]["by"]) == (
        "curriculum_link",
        "approved",
        w["email"],
    )
    assert rows[0]["detail"] == {"links": 1, "skills": 1, "statements": 0}


def test_a_second_confirm_changes_nothing_and_writes_no_approval(world):
    c, w = world
    curriculum_confirm.confirm(c, w["coord"], w["email"], "G9", w["subj"])
    again = curriculum_confirm.confirm(c, w["coord"], w["email"], "G9", w["subj"])
    assert again["changed"] == 0
    assert (
        c.execute(
            "select count(*) as n from approval where target like %s", (f"G9~{w['subj']}~%",)
        ).fetchone()["n"]
        == 1
    )


def test_the_route_answers_a_coordinator_and_refuses_the_rest(world, monkeypatch):
    c, w = world
    monkeypatch.setenv("ENGINE_KEY", "k")
    h = {"X-Engine-Key": "k"}
    app.dependency_overrides[deps.get_conn] = lambda: c
    try:
        with TestClient(app) as client:
            body = {"grade": "G9", "subject": w["subj"]}
            assert (
                client.post("/curriculum/confirm", headers=h, json=body | {"actor": w["eemail"]}).status_code
                == 403
            )
            ok = client.post("/curriculum/confirm", headers=h, json=body | {"actor": w["email"]})
            assert ok.status_code == 200 and ok.json()["changed"] == 2
            assert (
                client.post(
                    "/curriculum/confirm", headers=h, json=body | {"actor": "nobody@example.org"}
                ).status_code
                == 403
            )
    finally:
        app.dependency_overrides.clear()


def test_the_same_coordinator_confirms_the_same_grade_and_subject_again_when_the_machine_has_made_more(world):
    c, w = world
    curriculum_confirm.confirm(c, w["coord"], w["email"], "G9", w["subj"])
    skill = c.execute(
        "select code from registry_skill where tenant_id = %s order by code offset 1 limit 1", (w["t"],)
    ).fetchone()["code"]
    c.execute(
        "insert into learning_objective_skill (tenant_id, lo_code, skill_code, source) values (%s, %s, %s, 'machine')",
        (w["t"], w["b"], skill),
    )
    again = curriculum_confirm.confirm(c, w["coord"], w["email"], "G9", w["subj"])
    assert again["changed"] == 1
    assert (
        c.execute(
            "select count(*) as n from approval where target like %s", (f"G9~{w['subj']}~%",)
        ).fetchone()["n"]
        == 2
    )
