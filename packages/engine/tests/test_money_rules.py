"""Money MM-1 (specs/CP-77, D-078): the money rules the co-founders set."""

import copy
import os

import pytest

from engine.core import db, settings, staff
from engine.core import money_rules as mr
from engine.core.staff_write import grant
from tests import rows


@pytest.fixture
def conn():
    if not os.getenv("DATABASE_URL"):
        pytest.skip("needs DATABASE_URL (see .env.example)")
    with db.connect() as c:
        yield c
        c.rollback()


def _founder(conn):
    sid, _ = rows.a_member_of_staff(conn)
    grant(conn, rows.tenant(conn), sid, "founder", settings.school_today(conn), "test")
    return sid


def test_the_starting_rules_pass_their_own_check_and_name_the_brief_s_numbers(conn):
    rules = mr.current(conn)
    assert mr.problems(rules) == []
    assert rules["limits"]["bill_missing_hours"] == 48 and rules["limits"]["capex_floor"] == 5000


def test_each_role_holds_what_the_roles_below_it_hold(conn):
    rules = mr.current(conn)
    for role, can in (
        ("educator", ["submit"]),
        ("coordinator", ["submit", "approve"]),
        ("founder", ["submit", "approve", "pay", "set_rules"]),
    ):
        assert [c for c in ("submit", "approve", "pay", "set_rules") if mr.holds(rules, role, c)] == can, role


def test_only_a_founder_may_change_the_rules(conn):
    nobody, _ = rows.a_member_of_staff(conn)
    with pytest.raises(PermissionError):
        mr.set_rules(conn, nobody, mr.current(conn))
    assert mr.version(conn) == 1
    assert mr.set_rules(conn, _founder(conn), mr.current(conn)) == 2


def test_a_rule_set_that_cannot_work_is_refused_in_words_and_changes_nothing(conn):
    founder, rules = _founder(conn), mr.current(conn)
    for edit, said in (
        (lambda r: r["kinds"]["expense"].update(approve="educator"), "who may not approve claims"),
        (
            lambda r: r["kinds"]["expense"].update(pay=[{"up_to": 10000, "by": "founder"}]),
            "no one is set to pay an expense above",
        ),
        (lambda r: r.update(self_approval=True), "own claim"),
        (
            lambda r: r["kinds"]["expense"]["pay"][0].update(by="coordinator"),
            "paid by a coordinator, who cannot pay",
        ),
        (lambda r: r["can"].update(set_rules="treasurer"), "no role on the ladder may change these rules"),
    ):
        bad = copy.deepcopy(rules)
        edit(bad)
        with pytest.raises(ValueError, match=said):
            mr.set_rules(conn, founder, bad)
    assert mr.current(conn) == rules and mr.version(conn) == 1


def test_every_change_is_one_history_row_and_a_claim_keeps_the_rules_it_was_judged_by(conn):
    founder, first = _founder(conn), mr.current(conn)
    second = copy.deepcopy(first)
    second["limits"]["screenshot_limit"] = 700
    third = copy.deepcopy(second)
    third["limits"]["screenshot_limit"] = 900
    assert [mr.set_rules(conn, founder, second, "a raised limit"), mr.set_rules(conn, founder, third)] == [
        2,
        3,
    ]
    assert [mr.at_version(conn, n)["limits"]["screenshot_limit"] for n in (1, 2, 3)] == [500, 700, 900]
    with pytest.raises(ValueError):
        mr.at_version(conn, 4)
    logged = conn.execute(
        "select staff_id, reason from change_log where table_name = 'config' and row_id = 'money.rules' order by at, id"
    ).fetchall()
    assert [(str(r["staff_id"]), r["reason"]) for r in logged] == [
        (str(founder), "a raised limit"),
        (str(founder), None),
    ]


def test_a_co_founder_is_given_the_role_by_a_member_of_staff_and_can_then_change_the_rules(conn):
    sid, email = rows.a_member_of_staff(conn)
    _, by = rows.a_member_of_staff(conn)
    assert not mr.may_set(conn, sid)
    staff.give_role(conn, email, "founder", by)
    assert mr.may_set(conn, sid)
    for again, said in ((email, "already"), ("nobody@school.invalid", "no one on the staff list")):
        with pytest.raises(ValueError, match=said):
            staff.give_role(conn, again, "founder", by)
    with pytest.raises(ValueError, match="no role is called"):
        staff.give_role(conn, email, "treasurer", by)
