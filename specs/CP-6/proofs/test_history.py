"""CP-6 item 5, read for the fortnight: each state change writes an edit-history row.

Each `fortnight_cycle.move` leaves exactly one `fortnight_edit` row of kind 'state' for that fortnight, with subject
'<from>-><to>', op 'state', no reason, changed_by = the actor (a staff id) and a time. A refused move writes none (item 4
proves that). No database triggers exist in the lean design, so append-only is not claimed here.
"""

import uuid

from cp6_world import STATES, a_fortnight, conn, edits, fc, school  # noqa: F401


def test_5_each_state_change_writes_exactly_one_history_row(conn, school):
    """Item 5: one row per move, saying which step, who and when."""
    f = a_fortnight(conn, school, "2031-07-07")
    assert edits(conn, f["id"], "state") == [], "history before any move"
    for before, after in zip(STATES, STATES[1:], strict=False):
        who = f"staff:{uuid.uuid4()}"
        n = len(edits(conn, f["id"], "state"))
        fc().move(conn, f["id"], after, who)
        rows = edits(conn, f["id"], "state")
        assert len(rows) == n + 1, f"{before}->{after} wrote {len(rows) - n} history rows, not one"
        mine = [x for x in rows if x["subject"] == f"{before}->{after}"]
        assert len(mine) == 1, f"no single history row says {before}->{after}"
        r = mine[0]
        assert r["op"] == "state" and r["reason"] is None
        assert r["changed_by"] == who and r["created_at"] is not None
