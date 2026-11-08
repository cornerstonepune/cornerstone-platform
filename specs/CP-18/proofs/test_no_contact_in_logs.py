"""CP-18 item 6: no phone number, email address or name appears in any log, send record or delivery record.

Runs the sends (class list, not configured, combined list, a refusal: CP-17's approval is needed to send) and the
deliveries (delivered, failed, no contact on file, not configured; `deliver_due` in-process with a fake sender, then
`engine reminders --deliver` with no sending account), capturing every log record at DEBUG, stdout, stderr, the
command's output and exception messages. Then scans that text and every send and delivery row of the fake school's
lists for each fake person's name, email and phone (as typed and as digits)."""

import datetime as dt
import json
import logging
import re

import pytest
from conftest import (
    LONG_BEFORE,
    MON,
    approve,
    class_list,
    due_today,
    engine_cmd,
    klass,
    school,
    set_config,
    staff,
    tenant,
)
from engine.w2_print import materials_consolidate as mc
from engine.w2_print import materials_inventory as inv
from engine.w2_print import materials_remind as rem
from engine.w2_print import materials_send as send


def _leaks(text: str, people: list[dict]) -> list[str]:
    digits = re.sub(r"\D", "", text)
    found = []
    for p in people:
        for what in ("name", "email", "phone"):
            v = p.get(what)
            if v and (v.lower() in text.lower()
                      or (what == "phone" and re.sub(r"\D", "", v) in digits)
                      or (what == "name" and v.split()[-1].lower() in text.lower())):
                found.append(f"{what} of a fake person")
    return found


def _rows(c, sql, args) -> str:
    return "\n".join(json.dumps({k: str(v) for k, v in dict(r).items()}) for r in c.execute(sql, args))


@pytest.fixture
def logs(caplog):
    caplog.set_level(logging.DEBUG)
    return caplog


def test_sends_leave_no_contact_in_logs_or_send_records(conn, logs, capsys):
    s = school(conn)
    team, keeper = staff(conn, s), staff(conn, s)
    set_config(conn, s["tenant"], "materials.team_staff", str(team["id"]))
    set_config(conn, s["tenant"], "materials.inventory_staff", str(keeper["id"]))
    sent, unset, waiting = klass(conn, s), klass(conn, s), klass(conn, s)
    for k in (sent, unset, waiting):
        k["list"] = class_list(conn, s, k)
    said = []
    try:  # a refusal's message is scanned too
        inv.send(conn, mc.build(conn, s["tenant"], s["start"], s["start"] + dt.timedelta(days=13)),
                 sent["educators"][0]["id"])
    except Exception as e:
        said.append(str(e))
    for k in (sent, unset):
        approve(conn, k["list"], k["educators"][0]["id"])
    send.send(conn, sent["list"], "whatsapp", sent["educators"][0]["id"])
    set_config(conn, s["tenant"], "materials.team_staff", "")
    assert send.send(conn, unset["list"], "whatsapp", unset["educators"][0]["id"])["status"] == "not configured"
    approve(conn, waiting["list"], waiting["educators"][0]["id"])
    cid = mc.build(conn, s["tenant"], s["start"], s["start"] + dt.timedelta(days=13))
    inv.send(conn, cid, sent["educators"][0]["id"])
    out = capsys.readouterr()
    lists = [k["list"] for k in (sent, unset, waiting)]
    text = "\n".join([logs.text, out.out, out.err, *said,
                      _rows(conn, "select * from materials_send where list_id = any(%s)", (lists,)),
                      _rows(conn, "select * from materials_consolidated_send where consolidated_id = %s", (cid,))])
    assert _rows(conn, "select * from materials_send where list_id = any(%s)", (lists,)), "no send was recorded"
    assert not _leaks(text, s["people"])


def test_deliveries_leave_no_contact_in_logs_delivery_records_or_the_command_output(
        committed, server, fake_sender, logs, capsys, tmp_path):
    c = committed
    s = school(c)
    set_config(c, s["tenant"], "educator.timetable_enabled", True)
    team = staff(c, s)
    set_config(c, s["tenant"], "materials.team_staff", str(team["id"]))
    k = klass(c, s, educators=2)
    nobody = staff(c, s, contact=False)
    c.execute("insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, valid_from, granted_by)"
              " values (%s, %s, 'cover_educator', %s, '2026-01-01', 'cp18 proof')", (s["tenant"], nobody["id"], k["id"]))
    lid = class_list(c, s, k)
    rem.sync(c, lid, today=LONG_BEFORE)
    c.commit()
    fake_sender.fail_for = {k["educators"][1]["email"]}
    rem.deliver_due(c, MON - dt.timedelta(weeks=1), tenant(c), "cp18-proof")
    c.commit()
    assert fake_sender.calls, "nothing was handed to the sender"

    s2, k2, team2, lid2 = due_today(c)  # the command, with no sending account: not configured
    ran, _ = engine_cmd(server, "reminders", "--deliver", tmp=tmp_path)
    assert ran.returncode == 0, ran.stderr[-800:]
    out = capsys.readouterr()
    rows = _rows(c, "select d.* from reminder_delivery d join reminder r on r.id = d.reminder_id"
                    " where r.list_id = any(%s)", ([lid, lid2],))
    assert rows, "no delivery was recorded"
    text = "\n".join([logs.text, out.out, out.err, ran.stdout, ran.stderr, rows])
    assert not _leaks(text, s["people"] + s2["people"])
