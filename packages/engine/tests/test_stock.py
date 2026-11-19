"""Stock and the buy list (CP-82, specs/CP-82/spec.md), Done-when 1 to 7, through the engine's functions: what a campus holds, what its classes need,
what to buy. Placeholder rows made in the test's own transaction and rolled back; the people are placeholders (tests/rows.py)."""

import datetime as dt
import os
import uuid
from decimal import Decimal
from urllib.parse import parse_qs, urlsplit

import psycopg
import pytest

from engine.core import db, settings, stock
from engine.core import money_claims as mc
from engine.core.staff_write import grant
from engine.w2_print import materials_list as ml
from engine.w2_print import stock_buy
from tests import materials_rows as m
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
    """A catalogue item of this test's own: its code."""
    code = f"MAT-S{uuid.uuid4().hex[:6]}"
    conn.execute(
        "insert into material_item (tenant_id, code, name, unit) values (%s, %s, %s, %s)",
        (rows.tenant(conn), code, name, unit),
    )
    return code


def _held(conn, who, code, campus="Gurukul"):
    """The line of the on-hand list for one item."""
    return next(i for i in stock.on_hand(conn, who, campus)["items"] if i["code"] == code)


def _class_label(conn):
    s = m.school(conn)
    return conn.execute("select label from school_class where id = %s", (s["class"],)).fetchone()["label"]


def _claim(conn, who, campus="Gurukul"):
    return mc.submit_claim(conn, who, "450.50", DAY, "Sai Stores", "Stationery & art supplies", campus)


def test_stock_in_raises_the_campuss_on_hand_and_may_name_the_claim_it_was_bought_on(conn):
    lead, chalk = _person(conn, "ops"), _item(conn, "Chalk")
    stock.stock_in(conn, lead, "Gurukul", chalk, 20)
    stock.stock_in(conn, lead, "Gurukul", chalk, "5.5", _claim(conn, lead))
    assert _held(conn, lead, chalk)["on_hand"] == 25.5
    assert stock.history(conn, lead, "Gurukul", chalk)["moves"][0]["words"] == (
        "Stock in: 5.5 of Chalk (box), bought on the claim for Sai Stores of 10 Nov"
    )
    with pytest.raises(ValueError, match="made for Neev, not Gurukul"):
        stock.stock_in(conn, lead, "Gurukul", chalk, 1, _claim(conn, _person(conn, "coordinator"), "Neev"))
    with pytest.raises(ValueError, match="above zero"):
        stock.stock_in(conn, lead, "Gurukul", chalk, 0)


def test_handing_out_lowers_the_on_hand_and_going_below_zero_reads_count_it(conn):
    lead, chalk, label = _person(conn, "ops"), _item(conn, "Chalk"), None
    label = _class_label(conn)
    stock.stock_in(conn, lead, "Gurukul", chalk, 3)
    stock.hand_out(conn, lead, "Gurukul", chalk, 1, label)
    assert (_held(conn, lead, chalk)["on_hand"], _held(conn, lead, chalk)["word"]) == (2, "enough")
    stock.hand_out(conn, lead, "Gurukul", chalk, 5, label)
    assert (_held(conn, lead, chalk)["on_hand"], _held(conn, lead, chalk)["word"]) == (-3, "count it")
    with pytest.raises(ValueError, match="no class called Nowhere"):
        stock.hand_out(conn, lead, "Gurukul", chalk, 1, "Nowhere")


def test_a_count_sets_the_on_hand_to_what_was_counted_and_keeps_the_difference(conn):
    lead, chalk = _person(conn, "ops"), _item(conn, "Chalk")
    stock.stock_in(conn, lead, "Gurukul", chalk, 10)
    [done] = stock.count(
        conn, lead, "Gurukul", [{"material_code": chalk, "counted": 10.5}]
    )  # inside the tolerance: no reason
    assert (done["expected"], done["counted"], done["difference"]) == (10, 10.5, 0.5)
    stock.stock_in(conn, lead, "Gurukul", chalk, 2)
    assert _held(conn, lead, chalk)["on_hand"] == 12.5  # the count, and the moves after it
    first = _item(conn, "Tape")
    stock.count(
        conn, lead, "Gurukul", [{"material_code": first, "counted": 40}]
    )  # the books had nothing: no reason
    assert _held(conn, lead, first)["on_hand"] == 40


def test_a_difference_above_the_tolerance_and_a_write_off_are_refused_without_a_reason(conn):
    lead, chalk = _person(conn, "ops"), _item(conn, "Chalk")
    stock.stock_in(conn, lead, "Gurukul", chalk, 10)
    with pytest.raises(ValueError, match="Nothing was saved.*Chalk.*3 counted, 10 in the books.*Say why"):
        stock.count(conn, lead, "Gurukul", [{"material_code": chalk, "counted": 3}])
    assert _held(conn, lead, chalk)["on_hand"] == 10
    stock.count(
        conn, lead, "Gurukul", [{"material_code": chalk, "counted": 3, "reason": "Damaged in the rain"}]
    )
    assert _held(conn, lead, chalk)["on_hand"] == 3
    assert stock.history(conn, lead, "Gurukul", chalk)["moves"][0]["words"] == (
        "Counted 3 of Chalk (box); 7 fewer than the books said: Damaged in the rain"
    )
    with pytest.raises(ValueError, match="write-off needs a reason"):
        stock.write_off(conn, lead, "Gurukul", chalk, 1, "  ")
    stock.write_off(conn, lead, "Gurukul", chalk, 1, "Dried up")
    assert _held(conn, lead, chalk)["on_hand"] == 2


def test_an_item_below_its_minimum_is_low_and_listed_first_and_the_newest_minimum_wins(conn):
    lead, low, plenty = _person(conn, "ops"), _item(conn, "Zebra crayons"), _item(conn, "Art paper")
    stock.stock_in(conn, lead, "Gurukul", plenty, 50)
    stock.stock_in(conn, lead, "Gurukul", low, 4)
    stock.set_minimum(conn, lead, "Gurukul", low, 10)
    codes = [i["code"] for i in stock.on_hand(conn, lead, "Gurukul")["items"] if i["code"] in (low, plenty)]
    assert codes == [low, plenty] and _held(conn, lead, low)["word"] == "low"
    assert _held(conn, lead, low)["minimum"] == 10 and _held(conn, lead, plenty)["minimum"] is None
    stock.set_minimum(conn, lead, "Gurukul", low, 3)
    assert _held(conn, lead, low)["word"] == "enough"


def _campus_with_a_plan(conn):
    """A K2 class of the first campus with a list built for November 2031, and a class of the other campus with one too. → (s, campus name, acts)."""
    s = m.school(conn)
    name = conn.execute("select name from campus where id = %s", (s["campus"],)).fetchone()["name"]
    other = conn.execute(
        "select id from campus where tenant_id = %s and id <> %s limit 1", (s["tenant"], s["campus"])
    ).fetchone()["id"]
    elsewhere = m.another_class(conn, s, f"E{uuid.uuid4().hex[:4]}")
    conn.execute("update school_class set campus_id = %s where id = %s", (other, elsewhere))
    return s, name, elsewhere


def test_the_buy_list_is_the_need_less_what_is_held_plus_the_top_up_never_below_zero(conn):
    s, campus, elsewhere = _campus_with_a_plan(conn)
    lead = _person(conn, "ops", campus)
    a, b, c = s["acts"][:3]
    clay, glue, paper, tape = (
        m.item(conn, s, "Clay", "packet"),
        m.item(conn, s, "Glue", "bottle"),
        m.item(conn, s, "Paper", "ream"),
        _item(conn, "Tape", "roll"),
    )
    for activity, item, how_many in ((a, clay, 4), (b, glue, None), (c, paper, 10)):
        m.needs(conn, s, activity, item, how_many)
        m.planned(conn, s, m.MON, activity)
    m.planned(
        conn, s, m.MON + dt.timedelta(days=1), a, klass=elsewhere
    )  # the other campus's class needs clay too
    for klass in (s["class"], elsewhere):
        ml.build(conn, klass, "fortnight", m.MON, m.MON + dt.timedelta(days=13))
    stock.stock_in(conn, lead, campus, clay, 1)
    stock.set_minimum(conn, lead, campus, clay, 2)
    stock.stock_in(conn, lead, campus, paper, 12)
    stock.stock_in(conn, lead, campus, tape, 2)
    stock.set_minimum(conn, lead, campus, tape, 5)

    got = stock_buy.buy_list(conn, lead, campus, "2031-11")
    by = {ln["code"]: ln for ln in got["lines"]}
    assert (by[clay]["need"], by[clay]["on_hand"], by[clay]["minimum"], by[clay]["to_buy"]) == (4, 1, 2, 5)
    assert by[paper]["to_buy"] == 0  # held more than the need: never below zero
    assert (by[tape]["need"], by[tape]["to_buy"]) == (
        0,
        3,
    )  # no class needs it, but the store is under its minimum
    assert (by[glue]["need"], by[glue]["to_buy"]) == (None, None)  # a class gave no number: to confirm
    activity = conn.execute("select name from activity where tenant_id = %s and code = %s", (s["tenant"], a))
    label = conn.execute("select label from school_class where id = %s", (s["class"],)).fetchone()["label"]
    assert by[clay]["sources"] == [{"class": label, "activity": activity.fetchone()["name"]}]
    text = parse_qs(urlsplit(got["checklist_url"]).query)["text"][0]
    assert [ln.split(": ", 1)[1] for ln in text.splitlines()[1:] if "Clay" in ln or "Glue" in ln] == [
        "5 packet",
        "quantity to confirm (bottle)",
    ]
    assert "Paper" not in text and got["checklist_url"].startswith("https://wa.me/")


def test_the_buy_formula_never_inflates_for_wrong_books_and_never_makes_an_unknown_smaller():
    d = Decimal
    assert stock_buy.to_buy(d(10), d(4), d(5)) == 11  # use 10, keep 5 after: 4 + 11 - 10
    assert stock_buy.to_buy(d(3), d(10), None) == 0
    assert (
        stock_buy.to_buy(d(3), d(-4), None) == 3
    )  # the books went below zero: counted as none, not as a debt
    assert stock_buy.to_buy(None, d(0), d(5)) is None


def test_a_month_is_asked_for_as_year_and_month(conn):
    with pytest.raises(ValueError, match="YYYY-MM"):
        stock_buy.month_range("November")
    assert stock_buy.month_range("2032-02") == (dt.date(2032, 2, 1), dt.date(2032, 2, 29))


def test_a_stock_move_is_never_edited_or_deleted_and_the_history_reads_in_words(conn):
    lead, chalk = _person(conn, "ops"), _item(conn, "Chalk")
    stock.stock_in(conn, lead, "Gurukul", chalk, 5)
    stock.write_off(conn, lead, "Gurukul", chalk, 1, "Dried up")
    for statement in ("update stock_move set quantity = 99", "delete from stock_move"):
        with pytest.raises(psycopg.errors.RaiseException, match="append-only"), conn.transaction():
            conn.execute(statement)  # type: ignore[arg-type]
    moves = stock.history(conn, lead, "Gurukul", chalk)["moves"]
    assert [x["words"] for x in moves] == [
        "Written off 1 of Chalk (box): Dried up",
        "Stock in: 5 of Chalk (box)",
    ]
    assert moves[0]["on"] == str(settings.school_today(conn)) and moves[0]["by"] == "A"


def test_only_a_keeper_sees_stock_and_a_keeper_changes_only_the_campuses_they_act_for(conn):
    educator, lead = _person(conn), _person(conn, "ops")
    coordinator, founder = _person(conn, "coordinator"), _person(conn, "educator", grant_role="founder")
    chalk = _item(conn, "Chalk")
    assert stock.access(conn, educator) == {"campuses": []}
    for work in (
        lambda: stock.on_hand(conn, educator, "Gurukul"),
        lambda: stock.stock_in(conn, educator, "Gurukul", chalk, 1),
        lambda: stock_buy.buy_list(conn, educator, "Gurukul", "2031-11"),
    ):
        with pytest.raises(PermissionError, match="do not keep a store"):
            work()
    assert stock.access(conn, lead)["campuses"] == ["Gurukul"]
    with pytest.raises(PermissionError, match="not Neev"):
        stock.stock_in(conn, lead, "Neev", chalk, 1)
    with pytest.raises(PermissionError, match="not Neev"):
        stock_buy.buy_list(conn, lead, "Neev", "2031-11")
    for every in (coordinator, founder):
        assert stock.access(conn, every)["campuses"] == ["Gurukul", "Neev"]
        stock.stock_in(conn, every, "Neev", chalk, 1)
    assert _held(conn, coordinator, chalk, "Neev")["on_hand"] == 2
    with pytest.raises(ValueError, match="no campus called Elsewhere"):
        stock.on_hand(conn, coordinator, "Elsewhere")
