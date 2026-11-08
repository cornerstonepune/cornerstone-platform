"""CP-18 item 5: each reminder that falls due is delivered by email once to each of its people (the educators who hold
the class; the materials-team member named in `materials.team_staff`), or a `reminder_delivery` row says why not:
failed, not configured, or no contact on file. Nobody gets the same reminder twice, even when two runs start together.
A list sent before its reminder goes out gets no reminder (that case needs CP-17's approval to send). A reminder past the
first day the material is needed is not sent.

`materials_remind.deliver_due(conn, today, tenant, actor)` with a fake `engine.adapters.notify.send` and no SMTP_*
variable: nothing is sent. deliver_due commits after each message (design), so these use `committed`, which deletes
what they wrote."""

import datetime as dt
import threading

from conftest import (
    LONG_BEFORE,
    MON,
    approve,
    class_list,
    deliveries,
    klass,
    reminders,
    school,
    set_config,
    staff,
    tenant,
)
from engine.core import db
from engine.w2_print import materials_remind as rem
from engine.w2_print import materials_send as send

DUE = MON - dt.timedelta(weeks=1)  # both lead times (2 and 1 weeks) have come due; the material is needed on MON
ACTOR = "cp18-proof"


def _setup(c, educators=1):
    s = school(c)
    set_config(c, s["tenant"], "educator.timetable_enabled", True)
    team = staff(c, s)
    set_config(c, s["tenant"], "materials.team_staff", str(team["id"]))
    k = klass(c, s, educators=educators)
    lid = class_list(c, s, k)
    rem.sync(c, lid, today=LONG_BEFORE)
    c.commit()
    return s, k, team, lid


def _expected(c, lid, people_by_audience, status="delivered"):
    return {(r, aud, p, status) for aud, people in people_by_audience.items() for r in reminders(c, lid, aud)
            for p in people}


def test_each_person_gets_each_due_reminder_once_or_a_record_says_why_not(committed, fake_sender):
    c = committed
    s, k, team, lid = _setup(c, educators=2)
    e1, e2 = k["educators"]
    nobody = staff(c, s, contact=False)  # holds the class, no contact on file
    c.execute("insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, valid_from, granted_by)"
              " values (%s, %s, 'cover_educator', %s, '2026-01-01', 'cp18 proof')", (s["tenant"], nobody["id"], k["id"]))
    c.commit()
    fake_sender.fail_for = {e2["email"]}
    rem.deliver_due(c, DUE, tenant(c), ACTOR)
    c.commit()
    assert fake_sender.per_address() == {e1["email"]: 1, e2["email"]: 1, team["email"]: 1}
    got = deliveries(c, [lid])
    want = (_expected(c, lid, {"educator": [e1["id"]], "team": [team["id"]]})
            | _expected(c, lid, {"educator": [e2["id"]]}, "failed")
            | _expected(c, lid, {"educator": [nobody["id"]]}, "no contact"))
    assert got == want

    rem.deliver_due(c, DUE, tenant(c), ACTOR)  # the next run: nobody is sent a reminder they have had
    c.commit()
    calls = fake_sender.per_address()
    assert calls[e1["email"]] == 1 and calls[team["email"]] == 1
    rows = c.execute(
        "select d.reminder_id, d.to_staff, d.status, count(*) as n from reminder_delivery d join reminder r"
        " on r.id = d.reminder_id where r.list_id = %s and d.status in ('delivered', 'no contact')"
        " group by 1, 2, 3", (lid,)).fetchall()
    assert rows and all(r["n"] == 1 for r in rows), [r["n"] for r in rows]


def test_two_runs_started_together_send_each_reminder_once(committed, server, fake_sender):
    c = committed
    s, k, team, lid = _setup(c)
    t = tenant(c)
    fake_sender.delay = 0.3
    errors = []

    def run():
        try:
            with db.connect(server) as c2:
                rem.deliver_due(c2, DUE, t, ACTOR)
                c2.commit()
        except Exception as e:
            errors.append(repr(e))

    runs = [threading.Thread(target=run) for _ in range(2)]
    for r in runs:
        r.start()
    for r in runs:
        r.join(60)
    assert not errors, errors
    assert fake_sender.per_address() == {k["educators"][0]["email"]: 1, team["email"]: 1}
    assert deliveries(c, [lid]) == _expected(c, lid, {"educator": [k["educators"][0]["id"]], "team": [team["id"]]})


def test_a_list_sent_before_its_reminder_goes_out_gets_none(committed, fake_sender):
    c = committed
    s, k, team, lid = _setup(c)
    approve(c, lid, k["educators"][0]["id"])  # CP-17
    assert send.send(c, lid, "whatsapp", k["educators"][0]["id"])["status"] == "opened"
    c.commit()
    rem.deliver_due(c, DUE, tenant(c), ACTOR)
    c.commit()
    assert fake_sender.calls == []
    assert deliveries(c, [lid]) == set()


def test_a_reminder_past_the_first_day_needed_is_not_sent(committed, fake_sender):
    c = committed
    s, k, team, lid = _setup(c)
    rem.deliver_due(c, MON + dt.timedelta(days=1), tenant(c), ACTOR)
    c.commit()
    assert fake_sender.calls == []
    assert not {d for d in deliveries(c, [lid]) if d[3] == "delivered"}
