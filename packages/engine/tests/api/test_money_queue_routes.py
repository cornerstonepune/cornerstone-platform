"""The money screens' queue routes (CP-80, engine/api/routes/money_queue.py): what a person may do in Money, the claims waiting on them, and the
three decisions. The site's calls run on the test's own transaction, rolled back; the people are placeholders (tests/rows.py)."""

import copy
import datetime as dt
import os

import pytest
from fastapi.testclient import TestClient

from engine.api import deps
from engine.api.app import app
from engine.core import db, settings
from engine.core import money_claims as mc
from engine.core import money_rules as mr
from engine.core.staff_write import grant
from tests import rows

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")
KEY = "test-engine-key"
H = {"X-Engine-Key": KEY}
DAY = dt.date(2026, 11, 10)


@pytest.fixture
def engine(monkeypatch, tmp_path):
    monkeypatch.setenv("ENGINE_KEY", KEY)
    monkeypatch.setattr(mc, "ROOT", tmp_path)
    with db.connect() as conn:
        app.dependency_overrides[deps.get_conn] = lambda: conn
        try:
            with TestClient(app) as client:
                yield client, conn
        finally:
            app.dependency_overrides.clear()
            conn.rollback()


def _person(conn, name, role=None, campus="Gurukul", grant_role=None):
    """A member of staff of a campus: (their id, the email they sign in with)."""
    sid, email = rows.a_member_of_staff(conn)
    conn.execute("update pii.staff set name = %s where staff_id = %s", (name, sid))
    conn.execute(
        "update staff set role_code = %s, campus_id = (select id from campus where name = %s) where id = %s",
        (role, campus, sid),
    )
    if grant_role:
        grant(conn, rows.tenant(conn), sid, grant_role, settings.school_today(conn), "test")
    return sid, email


def _claim(conn, who, vendor="Sai Stores", amount="450.50", bill=None, hours_ago=0):
    """A claim filed `hours_ago` hours ago (a test's claims are all made in one moment, so it says which came first)."""
    claim = mc.submit_claim(
        conn, who[0], amount, DAY, vendor, "Stationery & art supplies", "Gurukul", bill=bill, bill_ext=".png"
    )
    conn.execute(
        "update expense set created_at = now() - make_interval(hours => %s) where id = %s", (hours_ago, claim)
    )
    return claim


def _of(waiting, *claims):
    """The ids of `claims` that are in this list, in the list's order (a database may hold other claims already)."""
    return [w["id"] for w in waiting if w["id"] in claims]


def _post(client, path, who, **body):
    return client.post(f"/money/{path}", headers=H, json={"actor": who[1], **body})


def test_what_a_person_may_do_and_what_waits_on_them(engine):
    client, conn = engine
    educator = _person(conn, "Asha Kulkarni")
    lead = _person(conn, "Ravi Joshi", "ops")
    founder = _person(conn, "Meera Rao", "coordinator", grant_role="founder")
    _claim(conn, educator)

    mine = _post(client, "access", educator).json()
    assert mine["can"] == {"approve": False, "pay": False, "set_rules": False}
    assert (mine["counts"], "Gurukul" in mine["campuses"]) == ({"approve": 0, "pay": 0}, True)
    got = _post(client, "access", lead).json()
    assert got["can"] == {"approve": True, "pay": False, "set_rules": False}
    assert got["counts"]["pay"] == 0 and got["counts"]["approve"] >= 1
    assert _post(client, "access", founder).json()["can"] == {"approve": True, "pay": True, "set_rules": True}


def test_the_queue_names_who_filed_by_first_name_oldest_first_and_only_what_the_person_may_approve(engine):
    client, conn = engine
    educator = _person(conn, "Asha Kulkarni")
    lead = _person(conn, "Ravi Joshi", "ops")
    elsewhere = _person(conn, "Dev Patil", "ops", "Neev")
    first = _claim(conn, educator, "First Stores", hours_ago=5)
    second = _claim(conn, educator, "Second Stores", "1200", b"x", hours_ago=2)
    _claim(conn, lead, "The lead's own")

    asked = _post(client, "queue", lead)
    waiting = asked.json()["approve"]
    assert _of(waiting, first, second) == [first, second]
    assert (waiting[0]["claimant"], waiting[0]["vendor"], waiting[0]["amount"]) == (
        "Asha",
        "First Stores",
        "450.50",
    )
    assert (waiting[1]["amount"], waiting[0]["has_bill"], waiting[1]["has_bill"]) == ("1200.00", False, True)
    assert (
        "Kulkarni" not in asked.text and educator[1] not in asked.text
    )  # a person is shown by first name, never email
    assert _post(client, "queue", educator).json() == {"approve": [], "pay": []}
    assert [
        w["claimant"] for w in _post(client, "queue", elsewhere).json()["approve"]
    ] == []  # another campus's


def test_approving_clears_the_claim_from_the_queue_and_sends_it_to_the_founder_to_pay(engine):
    client, conn = engine
    educator = _person(conn, "Asha Kulkarni")
    lead = _person(conn, "Ravi Joshi", "ops")
    founder = _person(conn, "Meera Rao", "coordinator", grant_role="founder")
    claim = _claim(conn, educator)

    assert (
        _post(client, "pay", founder, id=claim, paid_on=str(DAY), mode="UPI", ref="UTR-1").status_code == 422
    )
    assert _post(client, "approve", lead, id=claim).status_code == 200
    assert _of(_post(client, "queue", lead).json()["approve"], claim) == []
    assert _post(client, "queue", lead).json()["pay"] == []  # an operations lead does not pay
    to_pay = _post(client, "queue", founder).json()["pay"]
    assert [(w["claimant"], w["status"]) for w in to_pay if w["id"] == claim] == [("Asha", "approved")]
    counted = _post(client, "access", founder).json()["counts"]["pay"]

    paid = _post(client, "pay", founder, id=claim, paid_on=str(DAY), mode="UPI", ref="UTR-1")
    assert paid.status_code == 200
    assert _of(_post(client, "queue", founder).json()["pay"], claim) == []
    assert _post(client, "access", founder).json()["counts"]["pay"] == counted - 1
    mine = next(c for c in mc.my_claims(conn, educator[0]) if c["id"] == claim)
    assert (mine["status"], mine["paid_on"], mine["payment_ref"]) == ("paid", DAY, "UTR-1")
    assert (
        _post(client, "pay", founder, id=claim, paid_on=str(DAY), mode="UPI", ref="UTR-2").status_code == 422
    )


def test_sending_back_needs_a_reason_and_the_claimant_sees_it(engine):
    client, conn = engine
    educator = _person(conn, "Asha Kulkarni")
    lead = _person(conn, "Ravi Joshi", "ops")
    claim = _claim(conn, educator)

    said = _post(client, "send_back", lead, id=claim, reason="  ")
    assert (said.status_code, "why" in said.json()["detail"]) == (422, True)
    assert _post(client, "send_back", lead, id=claim, reason="the bill is not attached").status_code == 200
    assert _of(_post(client, "queue", lead).json()["approve"], claim) == []
    sent = next(c for c in mc.my_claims(conn, educator[0]) if c["id"] == claim)
    assert (sent["status"], sent["reason"]) == ("sent back", "the bill is not attached")
    assert _post(client, "approve", lead, id=claim).status_code == 422  # a decided claim is not decided again


def test_someone_who_may_not_decide_is_refused_in_words_and_nothing_changes(engine):
    client, conn = engine
    educator = _person(conn, "Asha Kulkarni")
    colleague = _person(conn, "Isha Nair")
    lead = _person(conn, "Ravi Joshi", "ops")
    claim = _claim(conn, educator)

    for path, extra in (("approve", {}), ("send_back", {"reason": "no"})):
        no = _post(client, path, colleague, id=claim, **extra)
        assert (no.status_code, bool(no.json()["detail"])) == (403, True)
    assert _post(client, "pay", lead, id=claim, paid_on=str(DAY), mode="UPI", ref="R").status_code == 403
    assert _of(_post(client, "queue", lead).json()["approve"], claim) == [claim]


def test_a_claim_is_paid_by_the_rules_it_was_filed_under_and_a_stranger_is_refused(engine):
    client, conn = engine
    educator = _person(conn, "Asha Kulkarni")
    lead = _person(conn, "Ravi Joshi", "ops")
    founder = _person(conn, "Meera Rao", "coordinator", grant_role="founder")
    other = _person(conn, "Kiran Shah", "coordinator", grant_role="founder")
    claim = _claim(conn, educator)
    mc.approve(conn, lead[0], claim)
    stricter = copy.deepcopy(mr.current(conn))
    stricter["can"]["pay"] = "founder"
    stricter["kinds"]["expense"]["pay"] = [{"up_to": None, "by": "founder"}]
    mr.set_rules(conn, founder[0], stricter)

    assert _of(_post(client, "queue", other).json()["pay"], claim) == [claim]
    assert _post(client, "access", educator).json()["counts"] == {"approve": 0, "pay": 0}
    stranger = client.post("/money/access", headers=H, json={"actor": "nobody@school.invalid"})
    assert stranger.status_code == 403
    assert client.post("/money/access", json={"actor": "x"}).status_code in (
        401,
        500,
    )  # the engine's key is needed
