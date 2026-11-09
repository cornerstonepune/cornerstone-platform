"""CP-12 item 7: in a frozen fortnight, a move without a reason is refused and a move with a reason is kept.
The freeze is CP-6's (issue #454): `fortnight_cycle.state` moved from `planning` to `frozen`; a frozen change's reason
is kept in `fortnight_edit`."""

import datetime as dt

from conftest import REASON, START, move, shown, snapshot, step, world

MON, THU = START, START + dt.timedelta(3)


def test_a_frozen_fortnight_needs_a_reason_and_the_reason_is_kept(conn, engine, monkeypatch):
    w = world(conn, monkeypatch)
    step(conn, w, "frozen")
    was = snapshot(conn, w)

    code, out = move(engine, w, MON, "s1", THU, "s2")
    assert code != 0, f"a frozen fortnight took a move with no reason:\n{out}"
    assert snapshot(conn, w) == was, "something was written"

    code, out = move(engine, w, MON, "s1", THU, "s2", reason=REASON)
    assert code == 0, out
    assert shown(conn, w, THU, "s2")["subject"] == "math", "the move with a reason did not happen"
    kept = conn.execute("select reason from timetable_move where school_class_id = %s", (w["class"],)).fetchall()
    assert [r["reason"] for r in kept] == [REASON]
    edits = conn.execute("select count(*) as n from fortnight_edit where fortnight_id = %s and reason = %s",
                         (w["fortnights"][2]["id"], REASON)).fetchone()["n"]
    assert edits > 0, "CP-6's record of the frozen change does not carry the reason"
