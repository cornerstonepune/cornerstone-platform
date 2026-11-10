"""The one history log, `change_log` (CP-27, docs/data-model.md): who changed what, when, before and after, and why.

The database writes it, one row per change, by one trigger function (`internal.change_kept`) on each table whose
history is kept: a change made anywhere, the engine or the website, is kept the same way. A writer says where its
changes come from for its transaction with `by` (an upload's label, the seed's, `staff:<id>` for a person); the website's
signed-in member of staff is found by the database. A step the engine alone takes, whose value is a column of its own
row, keeps its change with `keep` (CP-27 3C). Rows are never edited or deleted.
"""

import json
from typing import Any

from engine.core import db


def by(conn: db.Conn, who: str, reason: str | None = None) -> None:
    """Every change this transaction makes is kept as `who`'s (and, when given, for `reason`)."""
    conn.execute("select set_config('app.changed_by', %s, true)", (who,))
    if reason is not None:
        conn.execute("select set_config('app.change_reason', %s, true)", (reason,))


def keep(
    conn: db.Conn,
    tenant: db.Id,
    change: tuple[str, str, str],
    before: dict[str, Any] | None,
    after: dict[str, Any] | None,
    origin: str,
    reason: str | None = None,
    staff: db.Id | None = None,
) -> None:
    """One change a step of the engine makes itself, `change` = (table, row, op): a question keyed again (`rekey`) or
    its right answer corrected (`correct_key`), a page's choice (`choose_page`), a mistake named (`name_mistake`), a
    kind added, taken, stopped or started at a level; a sample edited, a materials line changed, a part of a page marked.
    Its value now is on its own row; this is how it came to be. `staff`: the member of staff it was, when the caller
    knows (else the signed-in one, if any)."""
    table, row_id, op = change
    conn.execute(
        "insert into change_log (tenant_id, table_name, row_id, op, before, after, staff_id, origin, reason)"
        " values (%s, %s, %s, %s, %s, %s, coalesce(%s::uuid, public.signed_in_staff()), %s, %s)",
        (
            tenant,
            table,
            row_id,
            op,
            None if before is None else json.dumps(before),
            None if after is None else json.dumps(after),
            staff,
            origin,
            reason,
        ),
    )


def of(conn: db.Conn, table: str, row_id: str, tenant: db.Id | None = None) -> list[dict[str, Any]]:
    """Every change kept for one row of `table` (its code, or its key columns joined by a space), oldest first."""
    return conn.execute(
        "select table_name, row_id, op, before, after, staff_id, origin, reason, at from change_log"
        " where table_name = %s and row_id = %s and (%s::uuid is null or tenant_id = %s::uuid) order by at, id",
        (table, row_id, tenant, tenant),
    ).fetchall()
