"""Alternatives on a class's list (CP-85). An activity says "pencils or crayons" by giving two of its items one `alt_group`
(`activity_material.alt_group`); the list has ONE line for the group: the first alternative by `ord`, unless the educator swapped
the line to another (`materials_swap`), and the others are kept on the line's `sources`, each lesson's entry naming them
(`alternatives: [{code, name}]`), so the screen can say "or crayons". Pure: rows in, rows out."""

from typing import Any


def pick(rows: list[dict[str, Any]], chosen: set[str]) -> dict[str, list[dict[str, Any]]]:
    """The planned lessons' materials (`materials_list._source_rows`) by the item each one asks for: one row for each lesson, activity
    and group, the alternative the educator chose (`chosen`: the items of this list she swapped a line to) else the first by `ord`, with
    the others it stands for as `alternatives`. A row with no group is its own."""
    together: dict[tuple[Any, ...], list[dict[str, Any]]] = {}
    for r in rows:
        key = (
            (r["session_id"], r["activity_code"], r["alt_group"]) if r["alt_group"] is not None else (id(r),)
        )
        together.setdefault(key, []).append(r)
    out: dict[str, list[dict[str, Any]]] = {}
    for group in together.values():
        group.sort(key=lambda r: r["ord"])
        keep = next((r for r in group if r["material_code"] in chosen), group[0])
        others = [{"code": r["material_code"], "name": r["name"]} for r in group if r is not keep]
        out.setdefault(keep["material_code"], []).append({**keep, "alternatives": others})
    return out


def common(sources: list[dict[str, Any]]) -> list[dict[str, str]]:
    """What a line may be swapped to: the alternatives that every lesson of the line names. A lesson that needs the item on its own
    names none, and then the line has no alternative (taking it away would leave that lesson without)."""
    named = [s.get("alternatives") or [] for s in sources]
    if not named:
        return []
    return [a for a in named[0] if all(a["code"] in {b["code"] for b in rest} for rest in named[1:])]
