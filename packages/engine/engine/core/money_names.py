"""A person's first name, for the money screens: a claim shows who filed it and the rules' history shows who changed them, by first name, never by id or email.
Read only through `pii.read_staff`, which writes who asked to `access_log` (the engine may not read the names table itself)."""

from typing import Any

from engine.core import db


def first_name(conn: db.Conn, staff_id: Any, actor: str) -> str:
    row = conn.execute("select name from pii.read_staff(%s, %s)", (staff_id, actor)).fetchone()
    return str(row["name"]).split()[0] if row and row["name"] else "Someone"
