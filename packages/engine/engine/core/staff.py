"""Who signs in to the website: the staff list, the database's alone (goals/ui4a-staff-and-search.yaml; CP-27 group 4).

Each person is a `staff` row (active, role, the classes and subjects they teach: ADR 0073, D1, the grade follows from
the class; the coordinator's classes are every class) and its `pii.staff` row (name, email, the password hash the
website checks and when it was set). The seed holds no one, so no one's email is in the public repository; a person
is put on the list by `engine staff add`, run by Nimish on his own machine, and their password is typed there and
nowhere else. Taking a person off makes them inactive and clears their password; no one is ever deleted.
"""

import hashlib
from collections.abc import Sequence
from typing import Any

from engine.core import db, settings

# node's own scrypt cost, and what a hash with no `n` in it was made with.
NODE_DEFAULT_N = 16384


def staff_hash(password: str, salt: str, n: int = NODE_DEFAULT_N) -> str:
    """`scrypt$n$salt$hash` exactly as `apps/web/lib/auth.ts` checks it: r=8, p=1, 64 bytes, and the hex salt used as
    TEXT, not decoded — node takes a string salt as its UTF-8 bytes, and decoding it here would make every password
    look wrong. `n` is how hard it is hashed, written beside the hash so it can be raised later without locking
    anyone out; the website's `password.scrypt_n` row says what a new password gets, and `scrypt$salt$hash` with no
    `n` (every hash made before 2026-10-26) is node's own default."""
    digest = hashlib.scrypt(password.encode(), salt=salt.encode(), n=n, r=8, p=1, dklen=64, maxmem=1152 * n)
    return f"scrypt${n}${salt}${digest.hex()}"


PERSON = (
    "select s.id, p.email, p.name, s.role_code as role, p.password_hash as password, p.password_set_at,"
    " s.classes, s.subjects from staff s join pii.staff p on p.staff_id = s.id"
    " where s.tenant_id = (select id from tenant where slug = %s)"
)


def staff(conn: db.Conn) -> list[dict[str, Any]]:
    """Everyone who may sign in, in the order they were put on: id, email, name, role, password (the hash, or None),
    password_set_at, classes, subjects."""
    return [
        dict(r)
        for r in conn.execute(
            f"{PERSON} and s.active and s.role_code is not null order by s.created_at, s.id",
            (db.tenant_slug(),),
        ).fetchall()
    ]


def hold(conn: db.Conn) -> None:
    """The school's staff rows held for this transaction, so two writers of the list take turns (a command reads the
    list, decides, then writes; the website writes one person in one statement)."""
    conn.execute(
        "select 1 from staff where tenant_id = (select id from tenant where slug = %s) for update",
        (db.tenant_slug(),),
    )


def roles(conn: db.Conn) -> set[str]:
    """The roles a person may hold: those the school's decisions name (`people.decides`), and any someone on the list
    already holds. A row, not a list in code."""
    decides: dict[str, list[str]] = settings.config(conn, "people.decides", {})
    named = {r for who in decides.values() for r in who}
    return named | {str(s["role"]) for s in staff(conn)}


def put(conn: db.Conn, person: dict[str, Any]) -> None:
    """`person` (as `staff` gives one: email, name, role, password, classes, subjects) on the list exactly as given:
    someone with that email already (on the list, or taken off it before) is updated, keeping their id and when their
    password was set; anyone else is added. No one else is touched."""
    email = str(person["email"]).strip().lower()
    values = (person["role"], list(person.get("classes") or []), list(person.get("subjects") or []))
    had = conn.execute(
        "select p.staff_id, p.password_hash from pii.staff p"
        " where p.tenant_id = (select id from tenant where slug = %s) and p.email = %s",
        (db.tenant_slug(), email),
    ).fetchone()
    if had is None:
        sid = db.one(
            conn,
            "insert into staff (tenant_id, campus_id, role_code, classes, subjects)"
            " select t.id, (select id from campus where tenant_id = t.id order by created_at limit 1), %s, %s, %s"
            " from tenant t where t.slug = %s returning id",
            (*values, db.tenant_slug()),
        )["id"]
        conn.execute(
            "insert into pii.staff (tenant_id, staff_id, name, email, password_hash)"
            " select tenant_id, id, %s, %s, %s from staff where id = %s",
            (str(person["name"]).strip(), email, person.get("password") or None, sid),
        )
        return
    conn.execute(  # someone taken off and put back is put on the list again, last
        "update staff set role_code = %s, classes = %s, subjects = %s,"
        " created_at = case when active then created_at else clock_timestamp() end, active = true where id = %s",
        (*values, had["staff_id"]),
    )
    conn.execute(
        "update pii.staff set name = %s, password_hash = %s where staff_id = %s",
        (str(person["name"]).strip(), person.get("password") or None, had["staff_id"]),
    )


def take_off(conn: db.Conn, email: str) -> None:
    """`email` can no longer sign in: inactive, no password. What they did stays theirs (their id is kept)."""
    conn.execute(
        "update pii.staff set password_hash = null, password_set_at = null"
        " where tenant_id = (select id from tenant where slug = %s) and email = %s",
        (db.tenant_slug(), email.strip().lower()),
    )
    conn.execute(
        "update staff set active = false where id in (select staff_id from pii.staff"
        " where tenant_id = (select id from tenant where slug = %s) and email = %s)",
        (db.tenant_slug(), email.strip().lower()),
    )


def classes(conn: db.Conn, wanted: Sequence[str]) -> list[str]:
    """The classes named, each once and in order, every one a class a child still in school is in; a typed class that
    is no class refuses them all, so a slip never narrows someone to a class that is not there."""
    named = sorted({c.strip() for c in wanted if c.strip()})
    there = {
        r["section"] for r in conn.execute("select distinct section from child_now where active").fetchall()
    }
    missing = [c for c in named if c not in there]
    if missing:
        raise ValueError(f"no child is in class {', '.join(missing)} — nothing changed")
    return named


def add(
    conn: db.Conn, email: str, name: str, role: str, password: str, teaches: Sequence[str] = ()
) -> dict[str, Any]:
    """→ the person as put on the list. Refuses an email already on it, a role no decision names, and a class no child
    is in, changing nothing."""
    email = email.strip().lower()
    people = staff(conn)
    if any(s["email"].lower() == email for s in people):
        raise ValueError(f"{email} is already on the staff list — nothing changed")
    if role not in roles(conn):
        raise ValueError(f"no one holds the role {role!r}: it is one of {', '.join(sorted(roles(conn)))}")
    person = {
        "email": email,
        "name": name.strip(),
        "role": role,
        "password": password,
        "classes": classes(conn, teaches),
    }
    put(conn, person)
    return person


def set_classes(conn: db.Conn, email: str, teaches: Sequence[str]) -> dict[str, Any]:
    """→ the person with the classes they now teach. Refuses someone not on the list and a class no child is in."""
    me = next((s for s in staff(conn) if s["email"].lower() == email.strip().lower()), None)
    if me is None:
        raise ValueError(
            f"{email} is not on the staff list — nothing changed (engine staff add puts them on)"
        )
    me["classes"] = classes(conn, teaches)
    put(conn, me)
    return me
