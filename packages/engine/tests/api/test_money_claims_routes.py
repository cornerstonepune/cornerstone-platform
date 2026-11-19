"""The money screens' routes for a person's own claims (engine/api/routes/money_claims.py, CP-80): what the form offers, filing with a
bill, My claims with its words, withdrawing, adding the bill later, and who may read a bill. The calls run on the test's own
transaction, rolled back; the people are placeholders (tests/rows.py)."""

import base64
import datetime as dt
import os

import pytest
from fastapi.testclient import TestClient

from engine.api import deps
from engine.api.app import app
from engine.core import db, settings
from engine.core import money_claims as mc
from engine.core.staff_write import grant
from tests import rows

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")
H = {"X-Engine-Key": "test-engine-key"}
PHOTO = b"\xff\xd8a photo of a bill"


@pytest.fixture
def engine(monkeypatch, tmp_path):
    monkeypatch.setenv("ENGINE_KEY", "test-engine-key")
    monkeypatch.setattr(mc, "ROOT", tmp_path)
    with db.connect() as conn:
        app.dependency_overrides[deps.get_conn] = lambda: conn
        try:
            with TestClient(app) as client:
                yield client, conn
        finally:
            app.dependency_overrides.clear()
            conn.rollback()


def _person(conn, role=None):
    sid, email = rows.a_member_of_staff(conn)
    conn.execute("update staff set role_code = %s where id = %s", (role, sid))
    return sid, email


def _founder(conn):
    sid, email = _person(conn, "coordinator")
    grant(conn, rows.tenant(conn), sid, "founder", settings.school_today(conn), "test")
    return sid, email


def _file(client, email, **over):
    body = {
        "actor": email,
        "amount": "450.50",
        "spent_on": "2026-11-10",
        "vendor": "Sai Stores",
        "category": "Stationery & art supplies",
        "campus": "Gurukul",
        "bill_b64": base64.b64encode(PHOTO).decode(),
        "bill_ext": ".jpg",
    } | over
    return client.post("/money/claims/create", headers=H, json=body)


def _mine(client, email):
    return client.post("/money/claims/mine", headers=H, json={"actor": email}).json()["claims"]


def test_the_form_offers_the_categories_the_campuses_the_person_acts_for_and_today(engine):
    client, conn = engine
    _, email = _person(conn)
    got = client.post("/money/form", headers=H, json={"actor": email}).json()
    assert got["categories"] == settings.config(conn, "money.categories")
    assert "Gurukul" in got["campuses"]  # a person who teaches no class acts for every campus
    assert got["today"] == settings.school_today(conn).isoformat()


def test_a_claim_filed_with_a_bill_shows_in_my_claims_in_words(engine):
    client, conn = engine
    _, email = _person(conn)
    made = _file(client, email, note="chart paper")
    assert made.status_code == 200
    [mine] = _mine(client, email)
    assert mine["id"] == made.json()["id"]
    assert (mine["amount"], mine["spent_on"], mine["vendor"], mine["status"], mine["has_bill"]) == (
        "450.50",
        "2026-11-10",
        "Sai Stores",
        "submitted",
        True,
    )
    assert "operations lead" in mine["next"]


def test_every_refusal_is_a_4xx_in_words_and_keeps_nothing(engine):
    client, conn = engine
    _, email = _person(conn)
    for over, said in (
        ({"amount": "0"}, "more than nothing"),
        ({"vendor": " "}, "who was paid"),
        ({"category": "Gold plating"}, "not a category"),
        ({"campus": "Atlantis"}, "do not act for"),
        ({"bill_ext": ".exe"}, "photo or a PDF"),
        ({"bill_b64": "not base64 !"}, "attach it again"),
    ):
        got = _file(client, email, **over)
        assert got.status_code == 422 and said in got.json()["detail"], over
    assert _mine(client, email) == []
    stranger = client.post("/money/claims/mine", headers=H, json={"actor": "nobody@school.invalid"})
    assert stranger.status_code == 403


def test_a_claim_filed_without_a_bill_takes_it_later_once(engine):
    client, conn = engine
    _, email = _person(conn)
    claim = _file(client, email, bill_b64=None, bill_ext="").json()["id"]
    assert _mine(client, email)[0]["has_bill"] is False
    send = {"actor": email, "id": claim, "bill_b64": base64.b64encode(PHOTO).decode(), "bill_ext": ".png"}
    assert client.post("/money/claims/add_bill", headers=H, json=send).status_code == 200
    assert _mine(client, email)[0]["has_bill"] is True
    again = client.post("/money/claims/add_bill", headers=H, json=send)
    assert again.status_code == 422 and "already has its bill" in again.json()["detail"]
    got = client.post("/money/claims/bill", headers=H, json={"actor": email, "id": claim}).json()
    assert got["content_type"] == "image/png" and base64.b64decode(got["b64"]) == PHOTO


def test_a_claim_is_withdrawn_by_its_claimant_only_and_then_says_so(engine):
    client, conn = engine
    _, email = _person(conn)
    _, other = _person(conn)
    claim = _file(client, email).json()["id"]
    refused = client.post("/money/claims/withdraw", headers=H, json={"actor": other, "id": claim})
    assert refused.status_code == 422 and "not your claim" in refused.json()["detail"]
    assert client.post("/money/claims/withdraw", headers=H, json={"actor": email, "id": claim}).json() == {}
    [mine] = _mine(client, email)
    assert mine["status"] == "withdrawn" and mine["next"] == "You took it back."


def test_a_sent_back_claim_gives_the_reason_and_a_paid_one_its_date_and_reference(engine):
    client, conn = engine
    _, email = _person(conn)
    lead, _ = _person(conn, "ops")
    founder = _founder(conn)[0]
    back, paid = _file(client, email).json()["id"], _file(client, email, vendor="Ravi Traders").json()["id"]
    mc.send_back(conn, lead, back, "the bill is not attached")
    mc.approve(conn, lead, paid)
    mc.pay(conn, founder, paid, dt.date(2026, 11, 12), "UPI", "UTR-1")
    seen = {c["id"]: c for c in _mine(client, email)}
    assert (seen[back]["status"], seen[back]["reason"]) == ("sent back", "the bill is not attached")
    assert (seen[paid]["status"], seen[paid]["paid_on"], seen[paid]["next"]) == (
        "paid",
        "2026-11-12",
        "Paid on 12 Nov, ref UTR-1.",
    )


def test_a_bill_is_read_by_its_claimant_the_lead_of_its_campus_and_a_founder_and_no_one_else(engine):
    client, conn = engine
    _, email = _person(conn)
    _, lead = _person(conn, "ops")
    _, other = _person(conn)
    founder, founder_email = _founder(conn)
    claim = _file(client, email).json()["id"]
    read = lambda who: client.post("/money/claims/bill", headers=H, json={"actor": who, "id": claim})  # noqa: E731
    for who in (email, lead, founder_email):
        assert base64.b64decode(read(who).json()["b64"]) == PHOTO
    assert read(other).status_code == 403
