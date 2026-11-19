"""Record what arrived, from the claim that bought it (CP-86, specs/CP-86/spec.md), Done-when 1 to 4, through the engine's functions. Placeholder rows made in
the test's own transaction and rolled back; the people are placeholders (tests/rows.py)."""

import datetime as dt
import os
import uuid

import pytest

from engine.core import db, settings, stock, stock_arrived
from engine.core import money_claims as mc
from engine.core.staff_write import grant
from tests import rows

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")
DAY = dt.date(2026, 11, 10)


@pytest.fixture
def conn(tmp_path, monkeypatch):
    monkeypatch.setattr(mc, "ROOT", tmp_path)
    with db.connect() as c:
        yield c
        c.rollback()


def _person(conn, role=None, campus="Gurukul", grant_role=None):
    """A member of staff of a campus, with the role they have and, besides it, a role granted today."""
    sid, _ = rows.a_member_of_staff(conn)
    conn.execute(
        "update staff set role_code = %s, campus_id = (select id from campus where name = %s) where id = %s",
        (role, campus, sid),
    )
    if grant_role:
        grant(conn, rows.tenant(conn), sid, grant_role, settings.school_today(conn), "test")
    return sid


def _item(conn, name, unit="box"):
    code = f"MAT-A{uuid.uuid4().hex[:6]}"
    conn.execute(
        "insert into material_item (tenant_id, code, name, unit) values (%s, %s, %s, %s)",
        (rows.tenant(conn), code, name, unit),
    )
    return code


def _claim(conn, state="approved", campus="Gurukul"):
    """A claim of a campus, filed by an educator there and taken as far as `state` (submitted, approved or paid) by the campus's lead and a founder."""
    claim = mc.submit_claim(
        conn, _person(conn, campus=campus), "450.50", DAY, "Sai Stores", "Stationery & art supplies", campus
    )
    if state != "submitted":
        mc.approve(conn, _person(conn, "ops", campus), claim)
    if state == "paid":
        mc.pay(conn, _person(conn, "coordinator", grant_role="founder"), claim, DAY, "UPI", "UTR-1")
    return claim


def _held(conn, who, code, campus="Gurukul"):
    return next(i for i in stock.on_hand(conn, who, campus)["items"] if i["code"] == code)["on_hand"]


def test_a_keeper_may_record_on_an_approved_or_paid_claim_of_their_campus_and_no_other(conn):
    lead, chalk = _person(conn, "ops"), _item(conn, "Chalk")
    for state, can in (("submitted", False), ("approved", True), ("paid", True)):
        claim = _claim(conn, state)
        got = stock_arrived.arrived(conn, lead, claim)
        assert got["claim"] == {"id": claim, "campus": "Gurukul", "status": state}
        assert got["can_record"] is can and got["moves"] == []
        if not can:
            with pytest.raises(ValueError, match=f"That claim is {state}"):
                stock_arrived.arrive(conn, lead, claim, [{"material_code": chalk, "quantity": 1}])
    educator = _person(conn)
    for work in (
        lambda: stock_arrived.arrived(conn, educator, _claim(conn)),
        lambda: stock_arrived.arrive(conn, educator, _claim(conn), [{"material_code": chalk, "quantity": 1}]),
    ):
        with pytest.raises(PermissionError, match="do not keep a store"):
            work()


def test_arriving_records_one_stock_in_per_line_each_naming_the_claim(conn):
    lead, chalk, glue = _person(conn, "ops"), _item(conn, "Chalk"), _item(conn, "Glue", "bottle")
    claim = _claim(conn)
    done = stock_arrived.arrive(
        conn,
        lead,
        claim,
        [{"material_code": chalk, "quantity": 20}, {"material_code": glue, "quantity": "2.5"}],
    )
    assert done == 2 and (_held(conn, lead, chalk), _held(conn, lead, glue)) == (20, 2.5)
    named = conn.execute(
        "select material_code, kind from stock_move where expense_id = %s order by seq", (claim,)
    ).fetchall()
    assert [(r["material_code"], r["kind"]) for r in named] == [(chalk, "in"), (glue, "in")]
    assert (
        stock.history(conn, lead, "Gurukul", chalk)["moves"][0]["words"]
        == "Stock in: 20 of Chalk (box), bought on the claim for Sai Stores of 10 Nov"
    )


def test_a_line_that_is_wrong_refuses_the_whole_call_and_names_it(conn):
    lead, chalk, glue = _person(conn, "ops"), _item(conn, "Chalk"), _item(conn, "Glue")
    claim = _claim(conn)
    bad = [
        [{"material_code": chalk, "quantity": 5}, {"material_code": glue, "quantity": 0}],
        [{"material_code": chalk, "quantity": 5}, {"material_code": "MAT-NOPE", "quantity": 1}],
        [{"material_code": chalk, "quantity": 5}, {"material_code": glue, "quantity": -2}],
    ]
    for lines, said in zip(
        bad,
        ("How many Glue came in must be", "no item MAT-NOPE", "How many Glue came in must be"),
        strict=True,
    ):
        with pytest.raises(ValueError, match=f"Nothing was saved.*{said}"):
            stock_arrived.arrive(conn, lead, claim, lines)
    with pytest.raises(ValueError, match="at least one item"):
        stock_arrived.arrive(conn, lead, claim, [])
    assert stock_arrived.arrived(conn, lead, claim)["moves"] == []  # not even the good line of a refused call
    assert chalk not in [
        i["code"] for i in stock.on_hand(conn, lead, "Gurukul")["items"]
    ]  # the books have no move for it


def test_the_claim_reads_what_arrived_item_by_item_and_recording_more_adds_to_it(conn):
    lead, chalk, glue = _person(conn, "ops"), _item(conn, "Chalk"), _item(conn, "Glue", "bottle")
    claim = _claim(conn, "paid")
    stock_arrived.arrive(
        conn, lead, claim, [{"material_code": chalk, "quantity": 20}, {"material_code": glue, "quantity": 3}]
    )
    later = _person(conn, "ops")
    stock_arrived.arrive(conn, later, claim, [{"material_code": chalk, "quantity": 4}])
    stock.stock_in(conn, lead, "Gurukul", glue, 9)  # bought on no claim: not this claim's
    moves = stock_arrived.arrived(conn, lead, claim)["moves"]
    today = str(settings.school_today(conn))
    assert [(m["item"], m["quantity"], m["unit"], m["on"]) for m in moves] == [
        ("Chalk", 4, "box", today),
        ("Glue", 3, "bottle", today),
        ("Chalk", 20, "box", today),
    ]
    assert {m["material_code"] for m in moves} == {chalk, glue} and moves[0]["by"] == "A"
    assert _held(conn, lead, chalk) == 24


def test_a_claim_of_another_campus_is_refused_to_a_keeper_who_does_not_act_for_it(conn):
    gurukul, neev = _person(conn, "ops"), _person(conn, "ops", "Neev")
    chalk, claim = _item(conn, "Chalk"), _claim(conn, campus="Neev")
    for work in (
        lambda: stock_arrived.arrived(conn, gurukul, claim),
        lambda: stock_arrived.arrive(conn, gurukul, claim, [{"material_code": chalk, "quantity": 1}]),
    ):
        with pytest.raises(PermissionError, match="made for Neev; you keep the store of Gurukul"):
            work()
    stock_arrived.arrive(conn, neev, claim, [{"material_code": chalk, "quantity": 1}])
    founder = _person(conn, "coordinator", grant_role="founder")  # keeps every campus's store
    assert [m["item"] for m in stock_arrived.arrived(conn, founder, claim)["moves"]] == ["Chalk"]
    with pytest.raises(ValueError, match="not one of the school's claims"):
        stock_arrived.arrived(conn, founder, uuid.uuid4())
