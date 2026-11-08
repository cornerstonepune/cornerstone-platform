"""CP-21 item 5: only the coordinator group (a setting per school, that group by default) can put a draft live; anyone
else is refused and nothing is written. Going live is kept with who, when and which draft; the record cannot be
changed or deleted."""

import json

import pytest

from conftest import ROOT, generated, go_live, refused, run_with, snapshot, swapped, world

SETTING = "timetable.go_live_group"


def test_the_go_live_group_is_a_setting_of_the_school():
    rows = json.loads((ROOT / "supabase" / "seed" / "config.json").read_text())["config"]
    assert any(r["key"] == SETTING for r in rows), f"supabase/seed/config.json has no {SETTING} row"


@pytest.mark.parametrize("who", ["educator", "nobody"])
def test_anyone_outside_the_group_is_refused_and_nothing_is_written(conn, engine, monkeypatch, who):
    w = world(conn, monkeypatch)
    run = run_with(conn, generated(conn, engine, w), swapped(w))
    by = w["educator"]["email"] if who == "educator" else "nobody-on-the-list@example.org"
    was = snapshot(conn, w)
    code, out = go_live(engine, w, run, by=by)
    assert code != 0, f"{who} put a draft live:\n{out}"
    assert snapshot(conn, w) == was, "something was written"


def test_the_coordinator_goes_live_and_the_record_keeps_who_when_and_which_draft_for_good(conn, engine, monkeypatch):
    w = world(conn, monkeypatch)
    run = run_with(conn, generated(conn, engine, w), swapped(w))
    code, out = go_live(engine, w, run)
    assert code == 0, out
    rows = conn.execute("select * from timetable_live where school_class_id = %s", (w["class"],)).fetchall()
    assert len(rows) == 1
    row = rows[0]
    assert row["who"] == w["coordinator"]["id"] and row["run_id"] == run and row["at"] is not None
    assert row["fortnight_id"] == w["fortnights"][2]["id"]
    refused(conn, "update timetable_live set reason = 'changed' where id = %s", (row["id"],))
    refused(conn, "delete from timetable_live where id = %s", (row["id"],))
    assert conn.execute("select * from timetable_live where id = %s", (row["id"],)).fetchone() == row
