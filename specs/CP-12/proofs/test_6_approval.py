"""CP-12 item 6: a fortnight with a clash nobody accepted cannot be approved, and in an approved fortnight a move that
would leave a clash nobody accepted is refused. This is a setting per school, on by default.

Approval is CP-6's step (issue #454): `fortnight_cycle.state` moved from `aligned` to `approved`."""

import datetime as dt
import json

import psycopg
import pytest
from conftest import REASON, ROOT, START, accept, clashes, move, snapshot, step, world

SETTING = "timetable.open_clash_blocks_approval"
MON, TUE = START, START + dt.timedelta(1)


def _over(conn, w):
    conn.execute("insert into timetable_limit (tenant_id, school_class_id, subject_code, span, most)"
                 " values (%s, %s, 'math', 'fortnight', 9)", (w["tenant"], w["class"]))


def _approve(conn, w):
    with conn.transaction():
        step(conn, w, "approved")


def test_the_setting_is_on_by_default_in_the_seed():
    rows = json.loads((ROOT / "supabase" / "seed" / "config.json").read_text())["config"]
    found = [r for r in rows if r["key"] == SETTING]
    assert found and found[0]["value"] is True, f"supabase/seed/config.json has no {SETTING} row set to true"


def test_a_fortnight_with_an_open_clash_cannot_be_approved_until_it_is_accepted(conn, engine, monkeypatch):
    w = world(conn, monkeypatch)
    _over(conn, w)
    step(conn, w, "frozen", "aligned")
    with pytest.raises(psycopg.Error, match="(?i)clash"):
        _approve(conn, w)
    state = conn.execute("select state from fortnight_cycle where fortnight_id = %s", (w["fortnights"][2]["id"],))
    assert state.fetchone()["state"] == "aligned"

    code, out = accept(engine, w, clashes(conn, w)[0]["clash_key"])
    assert code == 0, out
    _approve(conn, w)  # every clash accepted: approval goes through


def test_with_the_setting_off_a_school_approves_with_an_open_clash(conn, monkeypatch):
    w = world(conn, monkeypatch)
    conn.execute("insert into config (tenant_id, key, value, description) values (%s, %s, 'false', 'proof')"
                 " on conflict (tenant_id, key) do update set value = 'false'", (w["tenant"], SETTING))
    _over(conn, w)
    step(conn, w, "frozen", "aligned")
    _approve(conn, w)


def test_in_an_approved_fortnight_a_move_that_leaves_an_open_clash_is_refused(conn, engine, monkeypatch):
    w = world(conn, monkeypatch)
    conn.execute("insert into timetable_block (tenant_id, school_class_id, on_date, period_id, reason)"
                 " values (%s, %s, %s, %s, 'Proof block')", (w["tenant"], w["class"], TUE, w["period"]["extra"]))
    step(conn, w, "frozen", "aligned", "approved")
    was = snapshot(conn, w)

    code, out = move(engine, w, MON, "s1", TUE, "extra", reason=REASON)  # onto a blocked period
    assert code != 0, f"a move leaving an open clash in an approved fortnight went through:\n{out}"
    assert "clash" in out.lower(), f"the refusal does not say why:\n{out}"
    assert snapshot(conn, w) == was, "something was written"

    code, out = move(engine, w, MON, "s1", MON, "s2", reason=REASON)  # a swap that breaks no rule
    assert code == 0, out
