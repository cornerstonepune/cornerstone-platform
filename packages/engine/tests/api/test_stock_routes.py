"""The Stock screens' routes (CP-82, engine/api/routes/stock.py): every call a POST carrying the signed-in email as `actor`, as Money's are; what a keeper
may see and do, in the shapes the screens read, and a refusal in words. The site's calls run on the test's own transaction, rolled back."""

import os
import uuid

import pytest
from fastapi.testclient import TestClient

from engine.api import deps
from engine.api.app import app
from engine.core import db, settings, signer
from engine.core.staff_write import grant
from tests import rows

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")
KEY = "test-engine-key"
H = {"X-Engine-Key": KEY}


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


def _person(conn, name, role=None, campus="Gurukul", grant_role=None):
    """A member of staff of a campus: the email they sign in with."""
    sid, email = rows.a_member_of_staff(conn)
    conn.execute("update pii.staff set name = %s where staff_id = %s", (name, sid))
    conn.execute(
        "update staff set role_code = %s, campus_id = (select id from campus where name = %s) where id = %s",
        (role, campus, sid),
    )
    if grant_role:
        grant(conn, rows.tenant(conn), sid, grant_role, settings.school_today(conn), "test")
    return email


def _item(conn, name, unit="box"):
    code = f"MAT-R{uuid.uuid4().hex[:6]}"
    conn.execute(
        "insert into material_item (tenant_id, code, name, unit) values (%s, %s, %s, %s)",
        (rows.tenant(conn), code, name, unit),
    )
    return code


def _post(client, path, actor, **body):
    return client.post(f"/stock/{path}", headers=H, json={"actor": actor, **body})


def test_a_keeper_keeps_the_store_and_reads_it_in_the_shape_the_screens_take(engine):
    client, conn = engine
    lead, chalk = _person(conn, "Ravi Joshi", "ops"), _item(conn, "Chalk")
    got = _post(client, "access", lead).json()
    assert got["campuses"] == ["Gurukul"] and set(got["reasons"]) == {"count", "writeoff"}
    assert _post(client, "in", lead, campus="Gurukul", material_code=chalk, quantity=4).json() == {}
    assert (
        _post(client, "minimum", lead, campus="Gurukul", material_code=chalk, minimum=10).status_code == 200
    )
    held = _post(client, "on-hand", lead, campus="Gurukul").json()
    assert held["campus"] == "Gurukul"
    assert [i for i in held["items"] if i["code"] == chalk] == [
        {"code": chalk, "name": "Chalk", "unit": "box", "on_hand": 4, "minimum": 10, "word": "low"}
    ]
    counted = _post(
        client, "count", lead, campus="Gurukul", lines=[{"material_code": chalk, "counted": 4.5}]
    ).json()
    assert counted == {
        "lines": [
            {
                "material_code": chalk,
                "item": "Chalk",
                "unit": "box",
                "expected": 4,
                "counted": 4.5,
                "difference": 0.5,
            }
        ]
    }
    moves = _post(client, "history", lead, campus="Gurukul", material_code=chalk).json()["moves"]
    assert [m["kind"] for m in moves] == ["count", "minimum", "in"] and moves[0]["by"] == "Ravi"
    empty = _post(client, "buy-list", lead, campus="Gurukul", month="2031-12").json()
    assert set(empty) == {"campus", "month", "lines", "classes_without_list", "checklist_url"}
    assert [ln["code"] for ln in empty["lines"] if ln["code"] == chalk] == [
        chalk
    ]  # under its minimum: topped up
    line = next(ln for ln in empty["lines"] if ln["code"] == chalk)
    assert (line["need"], line["to_buy"], line["sources"]) == (0, 5.5, []) and empty["checklist_url"]


def test_a_refusal_says_why_in_words_and_a_person_who_keeps_no_store_is_refused_everywhere(engine):
    client, conn = engine
    lead, educator, chalk = (
        _person(conn, "Ravi Joshi", "ops"),
        _person(conn, "Asha Kulkarni"),
        _item(conn, "Chalk"),
    )
    _post(client, "in", lead, campus="Gurukul", material_code=chalk, quantity=10)
    no = _post(client, "count", lead, campus="Gurukul", lines=[{"material_code": chalk, "counted": 2}])
    assert no.status_code == 422 and "Say why they differ" in no.json()["detail"]
    no = _post(client, "writeoff", lead, campus="Gurukul", material_code=chalk, quantity=1)
    assert no.status_code == 422 and "needs a reason" in no.json()["detail"]
    no = _post(client, "out", lead, campus="Gurukul", material_code=chalk, quantity=1, class_label="Nowhere")
    assert no.status_code == 422 and "no class called Nowhere" in no.json()["detail"]
    assert _post(client, "in", lead, campus="Neev", material_code=chalk, quantity=1).status_code == 403
    assert _post(client, "access", educator).json() == {"campuses": []}
    for path, body in (
        ("on-hand", {}),
        ("in", {"material_code": chalk, "quantity": 1}),
        ("out", {"material_code": chalk, "quantity": 1, "class_label": "K2"}),
        ("count", {"lines": []}),
        ("writeoff", {"material_code": chalk, "quantity": 1, "reason": "Lost"}),
        ("minimum", {"material_code": chalk, "minimum": 1}),
        ("history", {}),
        ("buy-list", {"month": "2031-11"}),
    ):
        assert _post(client, path, educator, campus="Gurukul", **body).status_code == 403, path
    assert _post(client, "access", "nobody@school.invalid").status_code == 403


def test_what_arrived_is_read_and_recorded_against_a_claim_in_the_shape_the_screens_take(
    engine, tmp_path, monkeypatch
):
    from engine.core import money_claims as mc

    monkeypatch.setattr(mc, "ROOT", tmp_path)
    client, conn = engine
    lead, educator = _person(conn, "Ravi Joshi", "ops"), _person(conn, "Asha Kulkarni")
    chalk, glue = _item(conn, "Chalk"), _item(conn, "Glue", "bottle")
    claim = mc.submit_claim(
        conn,
        signer.lookup(conn, educator),
        "90",
        settings.school_today(conn),
        "Sai Stores",
        "Stationery & art supplies",
        "Gurukul",
    )
    bare = _post(client, "arrived", lead, id=claim).json()
    assert bare == {
        "claim": {"id": claim, "campus": "Gurukul", "status": "submitted"},
        "can_record": False,
        "moves": [],
    }
    no = _post(client, "arrive", lead, id=claim, lines=[{"material_code": chalk, "quantity": 1}])
    assert no.status_code == 422 and "That claim is submitted" in no.json()["detail"]
    mc.approve(conn, signer.lookup(conn, lead), claim)
    sent = [{"material_code": chalk, "quantity": 20}, {"material_code": glue, "quantity": 2.5}]
    assert _post(client, "arrive", lead, id=claim, lines=sent).json() == {"recorded": 2}
    got = _post(client, "arrived", lead, id=claim).json()
    assert got["can_record"] is True and got["claim"]["status"] == "approved"
    assert [(m["item"], m["quantity"], m["unit"], m["by"]) for m in got["moves"]] == [
        ("Glue", 2.5, "bottle", "Ravi"),
        ("Chalk", 20, "box", "Ravi"),
    ]
    assert set(got["moves"][0]) == {"on", "item", "material_code", "quantity", "unit", "by"}
    refused = _post(client, "arrive", lead, id=claim, lines=[{"material_code": chalk, "quantity": 0}])
    assert (
        refused.status_code == 422 and "Nothing was saved. How many Chalk came in" in refused.json()["detail"]
    )
    assert len(_post(client, "arrived", lead, id=claim).json()["moves"]) == 2
    for path in ("arrived", "arrive"):  # a person who keeps no store, and a keeper of another campus
        assert _post(client, path, educator, id=claim, lines=sent).status_code == 403, path
        elsewhere = _post(client, path, _person(conn, "Meera Rao", "ops", "Neev"), id=claim, lines=sent)
        assert elsewhere.status_code == 403 and "made for Gurukul" in elsewhere.json()["detail"], path
    assert _post(client, "arrived", lead, id="not-an-id").status_code == 422
