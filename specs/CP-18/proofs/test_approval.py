"""CP-18 item 2 (needs CP-17's approval, through conftest.approve): a list cannot be sent until its educator has
approved it as it reads at that moment; a combined list cannot be sent while any class list in it is unapproved, and the
refusal names those classes. Fake school rows in one rolled-back transaction; no message is sent (WhatsApp is a link)."""

import datetime as dt

import pytest
from conftest import approve, class_list, klass, line_ids, school, set_config, staff
from engine.w2_print import materials_consolidate as mc
from engine.w2_print import materials_inventory as inv
from engine.w2_print import materials_list as ml
from engine.w2_print import materials_send as send

FORTNIGHT = dt.timedelta(days=13)
NOT_A_REFUSAL = (TypeError, AttributeError, NameError, ImportError, KeyError, LookupError)


def _refused(call):
    with pytest.raises(Exception) as got:
        call()
    assert not isinstance(got.value, NOT_A_REFUSAL), f"a fault, not a refusal: {got.value!r}"
    return got.value


def _sends(conn, lid):
    return conn.execute("select count(*) as n from materials_send where list_id = %s", (lid,)).fetchone()["n"]


@pytest.fixture
def s(conn):
    s = school(conn)
    team = staff(conn, s)
    set_config(conn, s["tenant"], "materials.team_staff", str(team["id"]))
    inventory = staff(conn, s)
    set_config(conn, s["tenant"], "materials.inventory_staff", str(inventory["id"]))
    return s


def test_an_unapproved_list_is_refused_and_nothing_is_recorded(conn, s):
    k = klass(conn, s)
    lid = class_list(conn, s, k)
    _refused(lambda: send.send(conn, lid, "whatsapp", k["educators"][0]["id"]))
    assert _sends(conn, lid) == 0
    assert conn.execute("select state from materials_list where id = %s", (lid,)).fetchone()["state"] == "draft"


def test_a_list_changed_after_its_approval_is_refused(conn, s):
    k = klass(conn, s)
    lid = class_list(conn, s, k)
    who = k["educators"][0]["id"]
    approve(conn, lid, who)
    ml.set_quantity(conn, line_ids(conn, lid)[0], 7, who)  # it no longer reads as approved
    _refused(lambda: send.send(conn, lid, "whatsapp", who))
    assert _sends(conn, lid) == 0


def test_a_list_approved_as_it_reads_now_is_sent(conn, s):
    k = klass(conn, s)
    lid = class_list(conn, s, k)
    who = k["educators"][0]["id"]
    approve(conn, lid, who)
    out = send.send(conn, lid, "whatsapp", who)
    assert out["status"] == "opened"
    assert _sends(conn, lid) == 1


def test_a_combined_list_with_an_unapproved_class_is_refused_naming_that_class(conn, s):
    ready, waiting, also_waiting = klass(conn, s), klass(conn, s), klass(conn, s)
    for k in (ready, waiting, also_waiting):
        k["list"] = class_list(conn, s, k)
    approve(conn, ready["list"], ready["educators"][0]["id"])
    cid = mc.build(conn, s["tenant"], s["start"], s["start"] + FORTNIGHT)
    no = _refused(lambda: inv.send(conn, cid, ready["educators"][0]["id"]))
    said = str(no)
    assert waiting["name"] in said and also_waiting["name"] in said, f"the refusal does not name the classes: {said}"
    assert ready["name"] not in said, f"the refusal names an approved class: {said}"
    n = conn.execute("select count(*) as n from materials_consolidated_send where consolidated_id = %s",
                     (cid,)).fetchone()["n"]
    assert n == 0


def test_a_combined_list_with_every_class_approved_is_sent(conn, s):
    a, b = klass(conn, s), klass(conn, s)
    for k in (a, b):
        k["list"] = class_list(conn, s, k)
        approve(conn, k["list"], k["educators"][0]["id"])
    cid = mc.build(conn, s["tenant"], s["start"], s["start"] + FORTNIGHT)
    out = inv.send(conn, cid, a["educators"][0]["id"])
    assert out["status"] == "opened"
