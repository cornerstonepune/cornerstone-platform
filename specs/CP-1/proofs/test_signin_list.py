"""CP-1 item 2: the staff load leaves the sign-in list exactly as it was. Since CP-27 group 4 the list is the staff
tables: who may sign in, their role, classes, subjects, password hash and when it was set, as the website reads it
(`public.staff_list`), with when each row was last written.

The load is the existing staff-import tool, `engine.core.people.import_staff`, run for real (apply) on a placeholder
sign-in list, inside a transaction rolled back at the end. Every person here is made up.
"""

import pytest

from engine.core import db, people, staff

SIGNER = "proof.cy@example.test"
SIGN_IN = [  # placeholders; the password field stands in for a hash
    {"email": "proof.ann@example.test", "name": "Placeholder Ann", "role": "educator", "password": "scrypt$X$fake",
     "classes": ["K2"]},
    {"email": "proof.dee@example.test", "name": "Placeholder Dee", "role": "specialist", "password": "scrypt$X$fake",
     "classes": []},
    {"email": SIGNER, "name": "Placeholder Cy", "role": "coordinator", "password": "scrypt$X$fake", "classes": []},
]


@pytest.fixture
def conn():
    with db.connect() as c:
        yield c
        c.rollback()


def _set_list(conn, entries):
    for person in entries:
        staff.put(conn, person)


def _hash(conn):
    return db.one(
        conn,
        "select md5(coalesce(string_agg(row(l.*)::text || s.updated_at::text || p.updated_at::text, '|' order by l.id),"
        " '')) as h from public.staff_list(%s) l join staff s on s.id = l.id join pii.staff p on p.staff_id = l.id",
        (db.tenant_slug(),),
    )["h"]


def test_the_staff_import_leaves_the_sign_in_list_unchanged(conn):
    _set_list(conn, SIGN_IN)
    before, grants = _hash(conn), conn.execute("select count(*) as n from staff_role_grant").fetchone()["n"]
    report = people.import_staff(conn, SIGNER, apply=True)
    assert not report.refused, report.refused
    assert conn.execute("select count(*) as n from pii.staff where email like 'proof.%%@example.test'").fetchone()[
        "n"
    ] == len(SIGN_IN), "the placeholder staff are on the list"
    assert conn.execute("select count(*) as n from staff_role_grant").fetchone()["n"] == grants + 2, (
        "the import ran: it granted the educator's and the coordinator's campus roles"
    )
    assert _hash(conn) == before, "the sign-in list changed"
