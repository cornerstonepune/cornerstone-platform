"""CP-17 item 6: if a list's lines change after approval, by an educator's edit or by the system rebuilding it, it is no
longer approved; a fortnight list cannot be sent, by any route and including a second send, without a current
approval; daily and weekly lists work as today. Sends go through the engine's own `materials_send.send` (both routes),
and the backstops (a hand-written `materials_send` row, `materials_list.state = 'sent'`) are tried too.
Needs CP-6 (`fortnight_cycle`): until it is merged these proofs fail saying so."""

import datetime as dt

import psycopg
import pytest

from engine.w2_print import materials_list as ml
from engine.w2_print import materials_send as send

from cp17_world import (  # noqa: F401  (fixtures)
    approval_row, approvable, approve, conn, fortnight_list, item, refused, school, school_line, staff,
)


def no_send(conn, list_id, route, who) -> None:
    with pytest.raises(psycopg.Error):
        with conn.transaction():
            send.send(conn, list_id, route, who)


def approved_now(conn, s, list_id) -> bool:
    row = approval_row(conn, s, list_id)
    assert row is not None, "a fortnight list is not on the approvals list"
    return row["first_by"] is not None


def test_6_an_educator_edit_after_approval_voids_it(conn, school):
    w = approvable(conn, school)
    approve(conn, w["list"], w["educator"])
    assert approved_now(conn, school, w["list"])
    line = conn.execute("select id from materials_line where list_id = %s order by material_code limit 1",
                        (w["list"],)).fetchone()["id"]
    ml.set_quantity(conn, line, 7, w["educator"])
    assert not approved_now(conn, school, w["list"]), "an edited list still reads as approved"
    no_send(conn, w["list"], "whatsapp", w["educator"])
    approve(conn, w["list"], w["educator"])  # approved again on the lines as they are now
    assert send.send(conn, w["list"], "whatsapp", w["educator"])["status"] == "opened"


def test_6_a_rebuild_that_changes_the_lines_voids_it(conn, school):
    w = approvable(conn, school)
    approve(conn, w["list"], w["educator"])
    f = w["fortnight"]
    ml.build(conn, school["class"], "fortnight", f["starts_on"], f["ends_on"])  # the plan no longer needs its lines
    assert conn.execute("select count(*) as n from materials_line where list_id = %s", (w["list"],)).fetchone()["n"] < 2, \
        "the rebuild should have dropped the lines no plan needs"
    assert not approved_now(conn, school, w["list"]), "a rebuilt list still reads as approved"


def test_6_no_route_sends_a_fortnight_list_without_a_current_approval(conn, school):
    w = approvable(conn, school)
    lid, who = w["list"], w["educator"]
    no_send(conn, lid, "whatsapp", who)
    no_send(conn, lid, "email", who)
    refused(conn, "insert into materials_send (tenant_id, list_id, route, text, status, who)"
                  " values (%s, %s, 'whatsapp', 'a checklist', 'opened', %s)", (school["t"], lid, who))
    refused(conn, "update materials_list set state = 'sent' where id = %s", (lid,))
    approve(conn, lid, who)
    assert send.send(conn, lid, "email", who)["status"] == "not configured"
    assert send.send(conn, lid, "whatsapp", who)["status"] == "opened"


def test_6_a_second_send_after_a_change_needs_a_new_approval(conn, school):
    w = approvable(conn, school)
    lid, who = w["list"], w["educator"]
    approve(conn, lid, who)
    assert send.send(conn, lid, "whatsapp", who)["status"] == "opened"
    assert send.send(conn, lid, "whatsapp", who)["status"] == "opened"  # unchanged: still approved
    ml.add(conn, lid, item(conn, school), 1, w["fortnight"]["starts_on"], None, who)
    no_send(conn, lid, "whatsapp", who)
    no_send(conn, lid, "email", who)
    approve(conn, lid, who)
    assert send.send(conn, lid, "whatsapp", who)["status"] == "opened"


def test_6_daily_and_weekly_lists_send_as_today(conn, school):
    who = staff(conn, school, "class_teacher", school["class"])
    day = dt.date(2037, 11, 3)
    for period, lo, hi in (("day", day, day), ("week", day, day + dt.timedelta(days=4))):
        lid = fortnight_list(conn, school, period=period, lo=lo, hi=hi)
        school_line(conn, school, lid, item(conn, school), needed_on=lo)
        out = send.send(conn, lid, "whatsapp", who)
        assert out["status"] == "opened"
        assert conn.execute("select state from materials_list where id = %s", (lid,)).fetchone()["state"] == "sent"
        assert send.send(conn, lid, "email", who)["status"] == "not configured"
