"""CP-18 item 3 (approval through CP-17, conftest.approve): every send records who sent it, the text, when, and which
staff member it went to (`to_staff`). The recipient is a staff id in a setting (`materials.team_staff`,
`materials.inventory_staff`), never a phone number in a setting or a send record. With nobody named, or no number on
file, nothing is sent: the list stays unsent, its reminders stay on, and the record says "not configured".
Fake rows in one rolled-back transaction; a WhatsApp send is a link, so nothing leaves the machine."""

import datetime as dt
import json
import re

import pytest
from conftest import (
    LONG_BEFORE,
    ROOT,
    approve,
    class_list,
    klass,
    reminders,
    school,
    set_config,
    staff,
)
from engine.w2_print import materials_consolidate as mc
from engine.w2_print import materials_inventory as inv
from engine.w2_print import materials_remind as rem
from engine.w2_print import materials_send as send

PHONE = re.compile(r"\+?\d[\d\s-]{8,}\d")


def _digits(phone):
    return re.sub(r"\D", "", phone or "") or "no-phone"


def _no_phone_in(row, *phones):
    text = json.dumps({k: str(v) for k, v in dict(row).items()})
    for p in phones:
        assert p not in text and _digits(p) not in re.sub(r"\D", "", text), "a phone number is in a send record"


@pytest.fixture
def s(conn):
    return school(conn)


def _approved_list(conn, s):
    k = klass(conn, s)
    lid = class_list(conn, s, k)
    rem.sync(conn, lid, today=LONG_BEFORE)
    approve(conn, lid, k["educators"][0]["id"])
    return k, lid


def test_the_seeded_settings_name_staff_not_numbers():
    rows = {r["key"]: r["value"] for r in json.loads((ROOT / "supabase/seed/config.json").read_text())["config"]}
    assert "materials.team_staff" in rows and "materials.inventory_staff" in rows
    assert "materials.whatsapp_to" not in rows and "materials.inventory_whatsapp_to" not in rows
    for key in ("materials.team_staff", "materials.inventory_staff"):
        assert not PHONE.search(str(rows[key])), f"{key} holds a number"


def test_a_class_list_send_records_who_what_when_and_the_staff_member_it_went_to(conn, s):
    team = staff(conn, s)
    set_config(conn, s["tenant"], "materials.team_staff", str(team["id"]))
    k, lid = _approved_list(conn, s)
    who = k["educators"][0]["id"]
    out = send.send(conn, lid, "whatsapp", who)
    row = conn.execute("select * from materials_send where id = %s", (out["send_id"],)).fetchone()
    assert (row["who"], row["text"], row["to_staff"], row["status"]) == (who, out["text"], team["id"], "opened")
    assert row["at"] is not None
    _no_phone_in(row, team["phone"])
    assert conn.execute("select state from materials_list where id = %s", (lid,)).fetchone()["state"] == "sent"


@pytest.mark.parametrize("named", ["nobody", "no number on file"])
def test_with_no_recipient_nothing_is_sent_the_list_stays_unsent_and_reminders_stay_on(conn, s, named):
    if named == "no number on file":
        team = staff(conn, s, phone=False)
        set_config(conn, s["tenant"], "materials.team_staff", str(team["id"]))
    else:
        team = None
        set_config(conn, s["tenant"], "materials.team_staff", "")
    k, lid = _approved_list(conn, s)
    pending = set(reminders(conn, lid))
    assert pending, "the fixture made no reminders"
    out = send.send(conn, lid, "whatsapp", k["educators"][0]["id"])
    assert out["status"] == "not configured" and not out.get("wa_link")
    row = conn.execute("select * from materials_send where id = %s", (out["send_id"],)).fetchone()
    assert row["status"] == "not configured"
    assert row["to_staff"] == (team["id"] if team else None)
    assert conn.execute("select state from materials_list where id = %s", (lid,)).fetchone()["state"] == "draft"
    assert set(reminders(conn, lid)) == pending


def test_a_combined_list_send_records_its_staff_member_or_not_configured(conn, s):
    k, lid = _approved_list(conn, s)
    cid = mc.build(conn, s["tenant"], s["start"], s["start"] + dt.timedelta(days=13))
    set_config(conn, s["tenant"], "materials.inventory_staff", "")
    none = inv.send(conn, cid, k["educators"][0]["id"])
    assert none["status"] == "not configured" and not none.get("wa_link")
    keeper = staff(conn, s)
    set_config(conn, s["tenant"], "materials.inventory_staff", str(keeper["id"]))
    out = inv.send(conn, cid, k["educators"][0]["id"])
    rows = {r["id"]: r for r in conn.execute("select * from materials_consolidated_send where consolidated_id = %s",
                                             (cid,))}
    assert rows[none["send_id"]]["status"] == "not configured"
    row = rows[out["send_id"]]
    assert (row["who"], row["text"], row["to_staff"], row["status"]) == (
        k["educators"][0]["id"], out["text"], keeper["id"], "opened")
    assert row["at"] is not None
    _no_phone_in(row, keeper["phone"])
