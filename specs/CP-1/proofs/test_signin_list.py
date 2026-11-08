"""CP-1 item 2: the staff load leaves the sign-in list (`config` key app.staff) exactly as it was.

The load is the existing staff-import tool, `engine.core.people.import_staff`, run for real (apply) on a placeholder
sign-in list, inside a transaction rolled back at the end. Every person here is made up.
"""

import json

import pytest

from engine.core import db, people

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
    t = db.one(conn, "select id from tenant where slug = %s", (db.tenant_slug(),))["id"]
    if conn.execute("select 1 from config where tenant_id = %s and key = 'app.staff'", (t,)).fetchone():
        conn.execute("update config set value = %s where tenant_id = %s and key = 'app.staff'", (json.dumps(entries), t))
    else:
        conn.execute("insert into config (tenant_id, key, value) values (%s, 'app.staff', %s)", (t, json.dumps(entries)))


def _hash(conn):
    return db.one(
        conn, "select md5(coalesce(string_agg(value::text || updated_at::text, '|' order by id), '')) as h"
        " from config where key = 'app.staff'"
    )["h"]


def test_the_staff_import_leaves_the_sign_in_list_unchanged(conn):
    _set_list(conn, SIGN_IN)
    before = _hash(conn)
    report = people.import_staff(conn, SIGNER, apply=True)
    assert not report.refused, report.refused
    assert conn.execute("select count(*) as n from pii.staff where email like 'proof.%%@example.test'").fetchone()[
        "n"
    ] == len(SIGN_IN), "the import ran and added the placeholder staff"
    assert _hash(conn) == before, "the sign-in list changed"
