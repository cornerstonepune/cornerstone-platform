"""CP-21 item 7: in a frozen fortnight, going live without a reason is refused; with a reason it is kept.
The freeze is CP-6's (issue #454): `fortnight_cycle.state` moved from `planning` to `frozen`."""

from conftest import generated, go_live, run_with, snapshot, swapped, world

REASON = "Proof reason: the school agreed this change"


def test_a_frozen_fortnight_needs_a_reason_and_the_reason_is_kept(conn, engine, monkeypatch):
    w = world(conn, monkeypatch)
    run = run_with(conn, generated(conn, engine, w), swapped(w))
    conn.execute("update fortnight_cycle set state = 'frozen' where fortnight_id = %s", (w["fortnights"][2]["id"],))
    was = snapshot(conn, w)

    code, out = go_live(engine, w, run)
    assert code != 0, f"a frozen fortnight went live with no reason:\n{out}"
    assert snapshot(conn, w) == was, "something was written"

    code, out = go_live(engine, w, run, extra=("--reason", REASON))
    assert code == 0, out
    kept = conn.execute("select reason from timetable_live where school_class_id = %s", (w["class"],)).fetchall()
    assert [r["reason"] for r in kept] == [REASON]
