"""CP-70 (specs/CP-70/spec.md): what has been changed on an objective or an activity, read from `change_log` for the page that shows
it and for `curriculum_edit.undo`. Reading only; the edits themselves are `curriculum_edit`'s. No model, no name."""

from typing import Any, LiteralString

from engine.core import db

# link table → (the column of what is edited, the column of what it is tied to, the table of that, its word)
LINKS: dict[str, tuple[LiteralString, LiteralString, LiteralString, str]] = {
    "activity_skill": ("activity_code", "skill_code", "registry_skill", "skill"),
    "activity_objective": ("activity_code", "lo_code", "learning_objective", "objective"),
    "learning_objective_skill": ("lo_code", "skill_code", "registry_skill", "skill"),
}
OWN: dict[
    str, tuple[LiteralString, ...]
] = {  # kind → (the table that holds the thing, then the link tables that hang off it)
    "objective": ("learning_objective", "learning_objective_skill"),
    "activity": ("activity", "activity_skill", "activity_objective"),
}


def history(conn: db.Conn, t: db.Id, kind: str, code: str) -> list[dict[str, Any]]:
    """What has been changed on an objective or an activity and the links hanging off it, newest first: who, when, what, from, to, why.
    One entry per change (a subject change shows its word, not its code)."""
    own, *links = OWN[kind]
    rows = conn.execute(
        "select id, at, staff_id, table_name, op, before, after, reason from change_log where tenant_id = %s and"
        " table_name = any(%s) and row_id = %s order by at desc",
        (t, [own, *links], code),
    ).fetchall()
    return [_entry(r) for r in rows]


def _entry(r: dict[str, Any]) -> dict[str, Any]:
    before, after = r["before"] or {}, r["after"] or {}
    if r["table_name"] in LINKS:
        _, theirs, _, word = LINKS[r["table_name"]]
        what, was, now = word, before.get(theirs), after.get(theirs)
    else:
        keys = (
            [k for k in (after or before) if k != "subject_code"]
            if "subject" in (after or before)
            else list(after or before)
        )
        what = ", ".join(keys)
        was, now = (before.get(keys[0]), after.get(keys[0])) if len(keys) == 1 else (before, after)
    return {"id": str(r["id"]), "at": r["at"], "staff_id": r["staff_id"], "what": what, "before": was, "after": now,
            "reason": r["reason"], "op": r["op"], "table": r["table_name"]}  # fmt: skip
