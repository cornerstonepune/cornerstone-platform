"""The educator swaps a line to one of its alternatives (CP-85): the line that says "pencils", for an activity that asks for pencils or
crayons, becomes "crayons". The line keeps its day and its place on the list; the choice is a row of the one history log (op `swap`,
who, before and after), which is what keeps it across a rebuild (`materials_list.build` makes the group's line the one she chose).
She may swap only to an item every lesson of the line names as its alternative (`materials_alt.common`), and not to one the list
already has a line for: she changes that line, or takes this one off."""

from typing import Any
from uuid import UUID

from engine.core import db, history
from engine.w2_print import materials_alt, materials_list


class NotAnAlternative(Exception):
    """The item is not one of the line's alternatives."""


class AlreadyAnotherLine(Exception):
    """The list has a line for that item already (taken off or not): swapping to it would make two."""


def swap(conn: db.Conn, line_id: UUID, material_code: str, who: UUID) -> dict[str, Any]:
    """The line now asks for `material_code`; the list is built again so its quantity, unit and sources are the item's.
    → `{line_id, material_code, item, alternatives}`, the line as it reads now."""
    line = db.one(conn, "select * from materials_line where id = %s for update", (line_id,))
    if line["removed_at"] is not None:
        raise materials_list.LineRemoved(line_id)
    if material_code == line["material_code"]:
        return _now(conn, line_id)
    if material_code not in {a["code"] for a in materials_alt.common(line["sources"])}:
        raise NotAnAlternative(material_code)
    if conn.execute(
        "select 1 from materials_line where list_id = %s and material_code = %s",
        (line["list_id"], material_code),
    ).fetchone():
        raise AlreadyAnotherLine(material_code)
    conn.execute(
        "update materials_line set material_code = %s, updated_at = now() where id = %s",
        (material_code, line_id),
    )
    history.keep(
        conn,
        line["tenant_id"],
        ("materials_line", str(line_id), "swap"),
        {"material_code": line["material_code"]},
        {"material_code": material_code},
        f"staff:{who}",
        staff=who,
    )
    lst = db.one(
        conn,
        "select school_class_id, period, from_on, to_on from materials_list where id = %s",
        (line["list_id"],),
    )
    materials_list.build(conn, lst["school_class_id"], lst["period"], lst["from_on"], lst["to_on"])
    return _now(conn, line_id)


def _now(conn: db.Conn, line_id: UUID) -> dict[str, Any]:
    now = db.one(
        conn,
        "select l.id as line_id, l.material_code, i.name as item, l.sources from materials_line l"
        " join material_item i on i.tenant_id = l.tenant_id and i.code = l.material_code where l.id = %s",
        (line_id,),
    )
    return {k: now[k] for k in ("line_id", "material_code", "item")} | {
        "alternatives": materials_alt.common(now["sources"])
    }
