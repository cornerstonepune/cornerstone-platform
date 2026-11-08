"""CP-18 item 7: no test or proof sends a real message, and with no sending account set up, delivery records
"not configured" and contacts nothing.

- These proofs run with no SMTP_* variable (conftest removes any, even one `.env` loaded) and every other test here
  replaces `notify.send` with a fake: checked here by reading the environment a test sees.
- `engine.adapters.notify.send` with no sending account returns "not configured" and opens no connection.
- `deliver_due` with the real sender and no account: every person's row says "not configured", no connection is
  opened, and the reminder is still owed (it goes out once an account exists).
- `engine reminders --deliver`, the command the box's timer runs, the same, in a process whose every Python-level
  network connection is refused and written down.
Network attempts are caught by replacing socket connects and `smtplib.SMTP`; the database driver (libpq) is not Python's
socket, so the database still answers."""

import datetime as dt
import os
import smtplib
import socket

import pytest
from conftest import (
    LONG_BEFORE,
    MON,
    class_list,
    deliveries,
    due_today,
    engine_cmd,
    klass,
    reminders,
    school,
    set_config,
    staff,
    tenant,
)
from engine.w2_print import materials_remind as rem


@pytest.fixture
def no_network(monkeypatch):
    tried = []

    def refuse(*a, **k):
        tried.append("connect")
        raise OSError("cp18 proof: no network")

    monkeypatch.setattr(socket.socket, "connect", refuse)
    monkeypatch.setattr(socket, "create_connection", refuse)
    monkeypatch.setattr(smtplib.SMTP, "__init__", refuse)
    monkeypatch.setattr(smtplib, "SMTP_SSL", refuse)
    return tried


def test_no_proof_runs_with_a_sending_account():
    assert not [k for k in os.environ if k.startswith("SMTP_")]


def test_the_sender_with_no_account_says_not_configured_and_contacts_nothing(no_network):
    from engine.adapters import notify

    status, ref = notify.send("nobody.cp18@example.test", "Materials reminder", "a reminder")
    assert status == "not configured" and ref is None
    assert no_network == []


def test_delivery_with_no_account_records_not_configured_and_contacts_nothing(committed, no_network):
    c = committed
    s = school(c)
    set_config(c, s["tenant"], "educator.timetable_enabled", True)
    team = staff(c, s)
    set_config(c, s["tenant"], "materials.team_staff", str(team["id"]))
    k = klass(c, s)
    lid = class_list(c, s, k)
    rem.sync(c, lid, today=LONG_BEFORE)
    c.commit()
    rem.deliver_due(c, MON - dt.timedelta(weeks=1), tenant(c), "cp18-proof")
    c.commit()
    assert no_network == []
    want = {(r, "educator", k["educators"][0]["id"], "not configured") for r in reminders(c, lid, "educator")} | {
        (r, "team", team["id"], "not configured") for r in reminders(c, lid, "team")}
    assert want and deliveries(c, [lid]) == want
    assert len(reminders(c, lid)) == 4, "the reminders are no longer pending"


def test_the_command_with_no_account_records_not_configured_and_contacts_nothing(committed, server, tmp_path):
    c = committed
    s, k, team, lid = due_today(c)
    ran, tried = engine_cmd(server, "reminders", "--deliver", tmp=tmp_path)
    assert ran.returncode == 0, (ran.stdout + ran.stderr)[-800:]
    assert not tried.exists(), f"the command tried the network: {tried.read_text()[:200]}"
    got = deliveries(c, [lid])
    assert got and {d[3] for d in got} == {"not configured"}, got
    assert {d[2] for d in got} == {k["educators"][0]["id"], team["id"]}
