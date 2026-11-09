"""CP-12: the clashes of a fortnight, worked out by the database view `timetable_clash` from the timetable as it stands
(specs/CP-12/design.md, decisions 3 to 6). Here: the list for the command, the count the approve command and a move in
an approved fortnight check, and a person's acceptance of one clash with a reason. Code decides; no name is read."""

import datetime as dt
from typing import Any

from engine.core import db

SETTING = "timetable.open_clash_blocks_approval"  # on: an open clash stops approval, and a move that would leave one
GROUP = "timetable.accept_clash_group"  # the access group (CP-3) whose members may accept a clash
KINDS = ("blocked", "over_limit", "under_limit")


class Refused(Exception):
    """A check failed; nothing was written."""


def setting(conn: db.Conn, tenant: Any, key: str, default: Any) -> Any:
    """One school's setting (the row is per tenant; `settings.config` reads any tenant's)."""
    row = conn.execute("select value from config where tenant_id = %s and key = %s", (tenant, key)).fetchone()
    return row["value"] if row else default


def blocks_approval(conn: db.Conn, tenant: Any) -> bool:
    return bool(setting(conn, tenant, SETTING, True))


def open_by_kind(conn: db.Conn, fortnight_id: Any) -> dict[str, int]:
    """{kind: how many clashes nobody accepted} in one fortnight; empty when none."""
    return {
        r["kind"]: r["n"]
        for r in conn.execute(
            "select kind, count(*) as n from timetable_clash where fortnight_id = %s and not accepted"
            " group by kind order by kind",
            (fortnight_id,),
        ).fetchall()
    }


def words(open_: dict[str, int]) -> str:
    total = sum(open_.values())
    each = ", ".join(f"{k} {n}" for k, n in open_.items())
    return f"{total} clash{'es' if total != 1 else ''} nobody accepted ({each})"


def listing(conn: db.Conn, year: str, number: int | None) -> list[dict]:
    """Every clash of the year's teaching fortnights (one, by number, when given), oldest fortnight first."""
    return conn.execute(
        "select k.*, f.starts_on, f.ends_on from timetable_clash k join fortnight f on f.id = k.fortnight_id"
        " join academic_year y on y.id = f.academic_year_id join tenant t on t.id = f.tenant_id"
        " where t.slug = %s and y.label = %s and (%s::int is null or f.number = %s::int)"
        " order by f.starts_on, k.kind, k.week_code nulls last, k.detail",
        (db.tenant_slug(), year, number, number),
    ).fetchall()


def heading(row: dict) -> str:
    """`FN<n>`, or the dates of a fortnight with no number."""
    if row["fortnight_number"]:
        return f"FN{row['fortnight_number']}"
    return f"{row['starts_on']} to {row['ends_on']}" if "starts_on" in row else "a fortnight with no number"


def in_group(conn: db.Conn, tenant: Any, who: Any, group: str, today: dt.date) -> bool:
    """Whether `who` holds a current grant (CP-3: from valid_from, not on valid_to) in a role of the group."""
    return (
        conn.execute(
            "select 1 from staff_role_grant g join access_role_group rg on rg.tenant_id = g.tenant_id"
            " and rg.role_code = g.role_code where g.tenant_id = %s and g.staff_id = %s and rg.group_code = %s"
            " and g.valid_from <= %s and (g.valid_to is null or g.valid_to > %s)",
            (tenant, who, group, today, today),
        ).fetchone()
        is not None
    )


def accept(conn: db.Conn, key: str, *, who: Any, reason: str | None, today: dt.date) -> dict:
    """Accept the clash `key` as `who` (a staff id) with a reason. Refused, writing nothing, when the reason is blank,
    the key is no current clash, it is accepted already, or the person is not in the school's accepting group."""
    why = (reason or "").strip()
    if not why:
        raise Refused("give a reason: an accepted clash is kept with why.")
    clash = conn.execute("select * from timetable_clash where clash_key = %s", (key,)).fetchone()
    if clash is None:
        raise Refused("that is not a clash in any fortnight as the timetable stands.")
    if clash["accepted"]:
        raise Refused("that clash is accepted already.")
    group = str(setting(conn, clash["tenant_id"], GROUP, "everything")).strip('"')
    if not in_group(conn, clash["tenant_id"], who, group, today):
        raise Refused(f"only the '{group}' group may accept a clash ({GROUP}); this person is not in it.")
    conn.execute(
        "insert into timetable_clash_accept (tenant_id, fortnight_id, clash_key, kind, reason, who)"
        " values (%s, %s, %s, %s, %s, %s)",
        (clash["tenant_id"], clash["fortnight_id"], key, clash["kind"], why, who),
    )
    return {"fortnight": heading(clash), "kind": clash["kind"], "detail": clash["detail"]}
