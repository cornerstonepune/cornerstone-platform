"""CP-18 item 4 (needs CP-6's fortnight steps, conftest.fortnight_step / fortnight_state, and CP-17's approval):
sending a combined list that covers exactly one fortnight marks that fortnight "list sent", with the send's who and when.
Fake rows in one rolled-back transaction; the send is a WhatsApp link, nothing leaves the machine."""

import datetime as dt

from conftest import (
    approve,
    class_list,
    fortnight_state,
    fortnight_step,
    klass,
    school,
    set_config,
    staff,
)
from engine.w2_print import materials_consolidate as mc
from engine.w2_print import materials_inventory as inv


def test_a_combined_list_of_exactly_one_fortnight_marks_it_list_sent_with_the_same_who_and_when(conn):
    s = school(conn)
    keeper = staff(conn, s)
    set_config(conn, s["tenant"], "materials.inventory_staff", str(keeper["id"]))
    k = klass(conn, s)
    approve(conn, class_list(conn, s, k), k["educators"][0]["id"])
    coordinator = staff(conn, s)
    for step in ("frozen", "aligned", "approved"):  # CP-6: a step cannot be skipped
        fortnight_step(conn, s["fortnight"], step, coordinator["id"])
    sender = staff(conn, s)
    cid = mc.build(conn, s["tenant"], s["start"], s["start"] + dt.timedelta(days=13))
    out = inv.send(conn, cid, sender["id"])
    assert out["status"] == "opened"
    sent = conn.execute("select who, at from materials_consolidated_send where id = %s", (out["send_id"],)).fetchone()
    now = fortnight_state(conn, s["fortnight"])
    assert now["state"] == "list_sent"
    assert str(now["who"]) == str(sender["id"])
    assert abs(now["at"] - sent["at"]) < dt.timedelta(seconds=1), (now["at"], sent["at"])
