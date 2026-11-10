"""CP-12 item 6: the approve command refuses a fortnight with a clash nobody accepted, and in an approved fortnight the
move command refuses a move that would leave a clash nobody accepted. This is a setting per school, on by default.

Approval is CP-6's step (issue #454) run as an engine command (design decision 6: the check sits in the command, not in
a database trigger). The earlier steps (frozen, aligned) are still set directly; only the step into `approved` goes
through the command, via `conftest.approve`. Each proof settles the class's fortnight first (`conftest.settle`), because
CP-7's trigger `fortnight_cycle_gate` refuses the approved step while a class with a timetable is not settled."""

import datetime as dt
import json

from conftest import REASON, ROOT, START, accept, approve, block, clashes, limit, move, settle, snapshot, step, world

SETTING = "timetable.open_clash_blocks_approval"
MON, TUE = START, START + dt.timedelta(1)


def _over(conn, w):
    limit(conn, w, "math", "fortnight", most=9)


def _state(conn, w):
    return conn.execute("select state from fortnight where id = %s", (w["fortnights"][2]["id"],)).fetchone()["state"]


def test_the_setting_is_on_by_default_in_the_seed():
    rows = json.loads((ROOT / "supabase" / "seed" / "config.json").read_text())["config"]
    found = [r for r in rows if r["key"] == SETTING]
    assert found and found[0]["value"] is True, f"supabase/seed/config.json has no {SETTING} row set to true"


def test_the_approve_command_refuses_an_open_clash_until_it_is_accepted(conn, engine, monkeypatch):
    w = world(conn, monkeypatch)
    _over(conn, w)
    step(conn, w, "frozen", "aligned")
    settle(conn, w)

    code, out = approve(engine, w)
    assert code != 0, f"the approve command approved a fortnight with an open clash:\n{out}"
    assert "clash" in out.lower(), f"the refusal does not say why:\n{out}"
    assert _state(conn, w) == "aligned"

    code, out = accept(engine, w, clashes(conn, w)[0]["clash_key"])
    assert code == 0, out
    code, out = approve(engine, w)  # every clash accepted: approval goes through
    assert code == 0, out
    assert _state(conn, w) == "approved"


def test_with_the_setting_off_the_approve_command_approves_with_an_open_clash(conn, engine, monkeypatch):
    w = world(conn, monkeypatch)
    conn.execute("insert into config (tenant_id, key, value, description) values (%s, %s, 'false', 'proof')"
                 " on conflict (tenant_id, key) do update set value = 'false'", (w["tenant"], SETTING))
    _over(conn, w)
    step(conn, w, "frozen", "aligned")
    settle(conn, w)
    code, out = approve(engine, w)
    assert code == 0, out
    assert _state(conn, w) == "approved"


def test_in_an_approved_fortnight_a_move_that_leaves_an_open_clash_is_refused(conn, engine, monkeypatch):
    w = world(conn, monkeypatch)
    block(conn, w, on_date=TUE, period="extra")
    step(conn, w, "frozen", "aligned")
    settle(conn, w)
    code, out = approve(engine, w)  # no clash yet: the blocked period is empty
    assert code == 0, out
    assert _state(conn, w) == "approved"
    was = snapshot(conn, w)

    code, out = move(engine, w, MON, "s1", TUE, "extra", reason=REASON)  # onto a blocked period
    assert code != 0, f"a move leaving an open clash in an approved fortnight went through:\n{out}"
    assert "clash" in out.lower(), f"the refusal does not say why:\n{out}"
    assert snapshot(conn, w) == was, "something was written"

    code, out = move(engine, w, MON, "s1", MON, "s2", reason=REASON)  # a swap that breaks no rule
    assert code == 0, out
