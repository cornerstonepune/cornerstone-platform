"""CP-6 item 5, read for the fortnight: each state change of a fortnight writes an edit-history row.

Each step of the ladder leaves exactly one `fortnight_edit` row of kind 'state' for that fortnight, with subject
'<from>-><to>', op 'state', no reason and changed_by = who (`app.changed_by`). The history is append-only: a row cannot
be updated or deleted.
"""

import uuid

from cp6_world import STATES, a_fortnight, conn, move, refused, school  # noqa: F401
from engine.core import db


def state_rows(conn, fortnight_id) -> list[dict]:
    return conn.execute(
        "select subject, op, reason, changed_by, created_at from fortnight_edit"
        " where fortnight_id = %s and kind = 'state' order by created_at",
        (fortnight_id,),
    ).fetchall()


def test_5_each_state_change_writes_exactly_one_history_row(conn, school):
    f = a_fortnight(conn, school, "2031-07-07")
    for before, after in zip(STATES, STATES[1:]):
        who = f"staff:{uuid.uuid4()}"
        conn.execute("select set_config('app.changed_by', %s, true)", (who,))
        n = len(state_rows(conn, f["id"]))
        move(conn, f["id"], after)
        rows = state_rows(conn, f["id"])
        assert len(rows) == n + 1, f"{before}->{after} wrote {len(rows) - n} history rows, not one"
        r = next(x for x in rows if x["subject"] == f"{before}->{after}")
        assert r["op"] == "state" and r["reason"] is None
        assert r["changed_by"] == who and r["created_at"] is not None


def test_5_the_history_cannot_be_changed_or_removed(conn, school):
    f = a_fortnight(conn, school, "2031-07-07")
    move(conn, f["id"], "frozen")
    row = db.one(
        conn, "select id from fortnight_edit where fortnight_id = %s and kind = 'state' limit 1", (f["id"],)
    )["id"]
    refused(conn, "update fortnight_edit set changed_by = 'staff:someone-else' where id = %s", (row,))
    refused(conn, "delete from fortnight_edit where id = %s", (row,))
    assert db.one(conn, "select count(*) as n from fortnight_edit where id = %s", (row,))["n"] == 1
