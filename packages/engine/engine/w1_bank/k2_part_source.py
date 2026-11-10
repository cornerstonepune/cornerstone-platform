"""Whose words each part of a K2 activity page is: the school's (an upload), a machine's draft (naming its proposal, and
whether a person must check it), or a person's (CP-27 group 6: once the table `activity_part_source`). Each mark is a
row of the one history log (table `activity`, the page's code, op `part_source`, after {part, source, proposal_id,
check_me}); the view `activity_part_source` reads the newest mark of each part, so its readers are unchanged. A mark
taken away is a row whose source is empty. A mark keeps what it does not say from the mark before it (as the row did)."""

from typing import Any

from engine.core import db, history

OP = "part_source"
SOURCES = ("school", "drafted", "person")  # the school's words, a machine's draft, a person's
PARTS = ("objective", "steps", "thinking", "materials", "level_0", "level_1", "level_2", "level_3")


def now(conn: db.Conn, tenant: db.Id, code: str, part: str) -> dict[str, Any] | None:
    """The part's mark as it stands, or None (the school's words, never marked)."""
    return conn.execute(
        "select source, proposal_id, staff_id, check_me from activity_part_source"
        " where tenant_id = %s and activity_code = %s and part = %s",
        (tenant, code, part),
    ).fetchone()


def mark(
    conn: db.Conn, tenant: db.Id, code: str, part: str, origin: str, was: dict[str, Any] | None, **to: Any
) -> None:
    """The part marked `to` (source, and any of proposal_id, staff_id, check_me): one row of the log. `to` with no
    source takes the mark away. A part or a source that is none of these is refused (ValueError)."""
    if part not in PARTS or to.get("source") not in (None, *SOURCES):
        raise ValueError(
            f"{part} {to.get('source')}: a part of a page is marked the school's, drafted or a person's"
        )
    keep = {"proposal_id": None, "staff_id": None, "check_me": False} | {
        k: was[k] for k in ("proposal_id", "staff_id", "check_me") if was
    }
    after = {"part": part, "source": None} if to.get("source") is None else {"part": part} | keep | to
    after = {k: str(v) if k in ("proposal_id", "staff_id") and v is not None else v for k, v in after.items()}
    before = None if was is None else {"part": part} | {k: was[k] for k in ("source", "check_me")}
    history.keep(conn, tenant, ("activity", code, OP), before, after, origin, staff=after.get("staff_id"))
