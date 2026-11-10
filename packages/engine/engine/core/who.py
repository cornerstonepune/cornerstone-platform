"""Who did something, as the member of staff's id (CP-27 group 4): the one place a "who" becomes a `staff.id`.

A caller holds a person in whatever form reached it: a staff id (the id the website signs a person in as, since CP-27
group 4), the `staff:<id>` a database session names in `app.changed_by`, an
email (looked up through `public.staff_of_email`, which writes the look-up to the access log), a name, or "Name (role)"
as some stamps were written. Each is one member of staff, or nobody: an email or a name two people share is nobody,
never a guess. What is no member of staff (the loader, n8n, a test's own label, a person no longer known) comes back as
the `origin` it was given, for a writer to keep as where the row came from. Nothing here prints or returns a name or an
email: only an id, or the caller's own text.
"""

import re
from typing import Any, NamedTuple
from uuid import UUID

from engine.core import db, signer

# "Name (role)", as an approval stamp wrote a person
NAMED_WITH_ROLE = re.compile(r"^(?P<name>.*\S)\s*\([^()]*\)$")


class Who(NamedTuple):
    staff_id: UUID | None  # the member of staff, when the text is exactly one
    origin: str | None  # otherwise what the caller was called (its own text, trimmed); None for no one at all


def who(conn: db.Conn, actor: Any, tenant: Any = None) -> Who:
    """→ the member of staff `actor` names, or `Who(None, actor)` when it names none. A name is matched within the
    school `tenant` when one is given (an id or an email is one person whichever school asks)."""
    text = "" if actor is None else str(actor).strip()
    if not text:
        return Who(None, None)
    found = _by_id(conn, text) or _by_email(conn, text) or _by_name(conn, text, tenant)
    return Who(found, None) if found else Who(None, text)


def _by_id(conn: db.Conn, text: str) -> UUID | None:
    try:
        held = UUID(text.removeprefix("staff:"))
    except ValueError:
        return None
    row = conn.execute("select id from staff where id = %s", (held,)).fetchone()
    return row["id"] if row else None


def _by_email(conn: db.Conn, text: str) -> UUID | None:
    found = signer.lookup(conn, text) if "@" in text else None
    return UUID(found) if found else None


def _by_name(conn: db.Conn, text: str, tenant: Any) -> UUID | None:
    named = NAMED_WITH_ROLE.match(text)
    for name in (text, named["name"]) if named else (text,):
        ids = conn.execute(
            "select staff_id from pii.staff where name = %s and (%s::uuid is null or tenant_id = %s::uuid)",
            (name, tenant, tenant),
        ).fetchall()
        if len(ids) == 1:
            return ids[0]["staff_id"]
        if ids:
            return None  # two people share it: nobody, and never the name inside a "Name (role)" either
    return None
