"""The one history log, `change_log` (CP-27, docs/data-model.md): who changed what, when, before and after, and why.

The database writes it, one row per change, by one trigger function (`internal.change_kept`) on each table whose
history is kept: a change made anywhere, the engine or the website, is kept the same way. A writer says where its
changes come from for its transaction with `by` (an upload's label, the seed's, `staff:<id>` for a person); the website's
signed-in member of staff is found by the database. Rows are never edited or deleted.
"""

from typing import Any

from engine.core import db


def by(conn: db.Conn, who: str, reason: str | None = None) -> None:
    """Every change this transaction makes is kept as `who`'s (and, when given, for `reason`)."""
    conn.execute("select set_config('app.changed_by', %s, true)", (who,))
    if reason is not None:
        conn.execute("select set_config('app.change_reason', %s, true)", (reason,))


def of(conn: db.Conn, table: str, row_id: str, tenant: db.Id | None = None) -> list[dict[str, Any]]:
    """Every change kept for one row of `table` (its code, or its key columns joined by a space), oldest first."""
    return conn.execute(
        "select table_name, row_id, op, before, after, staff_id, origin, reason, at from change_log"
        " where table_name = %s and row_id = %s and (%s::uuid is null or tenant_id = %s::uuid) order by at, id",
        (table, row_id, tenant, tenant),
    ).fetchall()
