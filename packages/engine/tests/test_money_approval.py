"""Money MM-3 (specs/CP-79): the campus operations lead approves a claim, a founder pays it."""

import copy
import datetime as dt
import os

import pytest

from engine.core import db, settings
from engine.core import money_claims as mc
from engine.core import money_rules as mr
from engine.core.staff_write import grant
from tests import rows

DAY = dt.date(2026, 11, 10)


@pytest.fixture
def conn(tmp_path, monkeypatch):
    if not os.getenv("DATABASE_URL"):
        pytest.skip("needs DATABASE_URL (see .env.example)")
    monkeypatch.setattr(mc, "ROOT", tmp_path)
    with db.connect() as c:
        yield c
        c.rollback()


def _person(conn, role=None, campus="Gurukul", grant_role=None):
    """A member of staff on a campus, with the role they have and, besides it, a role granted today."""
    sid, _ = rows.a_member_of_staff(conn)
    conn.execute(
        "update staff set role_code = %s, campus_id = (select id from campus where name = %s) where id = %s",
        (role, campus, sid),
    )
    if grant_role:
        grant(conn, rows.tenant(conn), sid, grant_role, settings.school_today(conn), "test")
    return sid


def _claim(conn, who, amount="450.50", campus="Gurukul"):
    return mc.submit_claim(conn, who, amount, DAY, "Sai Stores", "Stationery & art supplies", campus)


def _status(conn, who, claim):
    return next(c for c in mc.my_claims(conn, who) if c["id"] == claim)


def test_the_operations_lead_of_the_campus_approves_and_the_claimant_sees_it(conn):
    educator, lead = _person(conn), _person(conn, "ops")
    claim = _claim(conn, educator)
    assert [c["id"] for c in mc.queue(conn, lead)] == [claim]
    mc.approve(conn, lead, claim)
    assert _status(conn, educator, claim)["status"] == "approved" and mc.queue(conn, lead) == []
    row = conn.execute(
        "select decision, by from approval where kind = 'expense' and target = %s", (claim,)
    ).fetchone()
    assert (row["decision"], row["by"]) == ("approved", str(lead))


def test_who_may_not_approve_a_claim(conn):
    educator, lead, other_campus, founder = (
        _person(conn),
        _person(conn, "ops"),
        _person(conn, "ops", "Neev"),
        _person(conn, "coordinator", grant_role="founder"),
    )
    mine = _claim(conn, lead)
    claim = _claim(conn, educator)
    for who, said in ((educator, "may not approve"), (other_campus, "not your campus"), (lead, "own claim")):
        with pytest.raises((PermissionError, ValueError), match=said):
            mc.approve(conn, who, claim if who != lead else mine)
    with pytest.raises(
        PermissionError, match="founder"
    ):  # an operations lead's own claim is for the one who would pay it
        mc.approve(conn, _person(conn, "ops"), mine)
    mc.approve(conn, founder, mine)
    assert _status(conn, lead, mine)["status"] == "approved"


def test_a_claim_sent_back_says_why_and_a_decided_claim_is_not_decided_again(conn):
    educator, lead = _person(conn), _person(conn, "ops")
    claim = _claim(conn, educator)
    with pytest.raises(ValueError, match="say why"):
        mc.send_back(conn, lead, claim, " ")
    mc.send_back(conn, lead, claim, "the bill is not attached")
    sent = _status(conn, educator, claim)
    assert (sent["status"], sent["reason"]) == ("sent back", "the bill is not attached")
    with pytest.raises(ValueError, match="already"):
        mc.approve(conn, lead, claim)


def test_a_founder_pays_an_approved_claim_with_a_reference_and_it_shows_paid(conn):
    educator, lead, founder = (
        _person(conn),
        _person(conn, "ops"),
        _person(conn, "coordinator", grant_role="founder"),
    )
    claim = _claim(conn, educator)
    with pytest.raises(ValueError, match="not approved"):
        mc.pay(conn, founder, claim, DAY, "UPI", "UTR-1")
    mc.approve(conn, lead, claim)
    with pytest.raises(PermissionError):
        mc.pay(conn, lead, claim, DAY, "UPI", "UTR-1")
    with pytest.raises(ValueError, match="reference"):
        mc.pay(conn, founder, claim, DAY, "UPI", " ")
    mc.pay(conn, founder, claim, DAY, "UPI", "UTR-1")
    paid = _status(conn, educator, claim)
    assert (paid["status"], paid["paid_on"], paid["payment_ref"]) == ("paid", DAY, "UTR-1")
    with pytest.raises(ValueError, match="already paid"):
        mc.pay(conn, founder, claim, DAY, "UPI", "UTR-2")


def test_a_claim_is_judged_by_the_rules_it_was_filed_under(conn):
    educator, lead, founder = (
        _person(conn),
        _person(conn, "ops"),
        _person(conn, "coordinator", grant_role="founder"),
    )
    old = _claim(conn, educator)
    stricter = copy.deepcopy(mr.current(conn))
    stricter["kinds"]["expense"]["approve"] = "founder"
    mr.set_rules(conn, founder, stricter)
    new = _claim(conn, educator)
    mc.approve(conn, lead, old)
    with pytest.raises(PermissionError):
        mc.approve(conn, lead, new)
    mc.approve(conn, founder, new)
