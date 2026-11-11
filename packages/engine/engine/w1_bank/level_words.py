"""CP-31: a level's sentence changed from the engine, with who and when (specs/CP-31/spec.md).

The sentence is `skill.difficulty -> <level> -> words`, the one place it lives (`skill_level.looks_like` follows it). A
change withdraws that level's approval, so whoever approves next has read the new words: the same edit the site's old
page makes in SQL, now with the person kept. Who and why are kept by the database's own trigger (`change_log`), told by
`history.by`. Code decides everything here; no model, no name: a person is a staff id."""

import json

from engine.core import db, history

MOST = 400  # the words of a level, as the old page's field allowed


class Refused(Exception):
    """A change not made, with the words the page shows and the HTTP code."""

    def __init__(self, words: str, status: int = 422):
        super().__init__(words)
        self.status = status


def _level(conn: db.Conn, skill: str, level: str) -> dict:
    got = conn.execute(
        "select tenant_id, difficulty -> %s ->> 'words' as words, level_approved ? %s as approved,"
        " difficulty ? %s as has from skill where code = %s",
        (level, level, level, skill),
    ).fetchone()
    if got is None:
        raise Refused("No such skill.", 404)
    if not got["has"]:
        raise Refused("That skill has no such level.", 404)
    return got


def change(conn: db.Conn, staff: str, skill: str, level: str, words: str, reason: str | None = None) -> dict:
    """The level's sentence made `words`, its approval withdrawn, the person kept. The same sentence changes nothing."""
    words = (words or "").strip()
    if not words:
        raise Refused("A level needs its sentence.", 422)
    if len(words) > MOST:
        raise Refused(f"Please keep a level's sentence under {MOST} characters.", 422)
    now = _level(conn, skill, level)
    if words != (now["words"] or ""):
        history.by(conn, f"staff:{staff}", (reason or "").strip() or None)
        conn.execute(
            "update skill set difficulty = jsonb_set(difficulty, array[%s, 'words'], %s::jsonb),"
            " level_approved = level_approved - %s, updated_at = now() where code = %s",
            (level, json.dumps(words), level, skill),
        )
    return {"changed": words != (now["words"] or ""), **read(conn, skill, level)}


def read(conn: db.Conn, skill: str, level: str) -> dict:
    """The sentence now, whether the level is approved, and each earlier sentence with when and which staff id."""
    now = _level(conn, skill, level)
    rows = conn.execute(
        "select at, staff_id::text as staff, before ->> 'looks_like' as was, after ->> 'looks_like' as now, reason"
        " from change_log where table_name = 'skill_level' and row_id = %s and (after ? 'looks_like')"
        " order by at desc, id desc",
        (f"{skill} {level}",),
    ).fetchall()
    return {"words": now["words"], "approved": bool(now["approved"]), "history": rows}
