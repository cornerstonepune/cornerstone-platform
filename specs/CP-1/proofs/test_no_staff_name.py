"""CP-1 item 6 (second half): loading staff puts no staff name outside the private schema (`pii`).

The staff load (`engine.core.people.import_staff`, applied) runs on a placeholder sign-in list whose names are made up
and unmistakable. Every table the transaction wrote to outside `pii` is then searched for those names. The sign-in
list itself (`config` key app.staff) is the sign-in system's and out of scope, so that one row is not searched.
"""

import json

import pytest
from psycopg import sql

from engine.core import db, people

NAMES = ["Zorblax Quimbly", "Ottoline Vexmarsh"]
SIGNER = "proof.zq@example.test"
SIGN_IN = [
    {"email": SIGNER, "name": NAMES[0], "role": "coordinator", "password": "scrypt$X$fake", "classes": []},
    {"email": "proof.ov@example.test", "name": NAMES[1], "role": "specialist", "password": "scrypt$X$fake",
     "classes": []},
]


@pytest.fixture
def conn():
    with db.connect() as c:
        yield c
        c.rollback()


def test_a_staff_load_writes_no_staff_name_outside_pii(conn):
    t = db.one(conn, "select id from tenant where slug = %s", (db.tenant_slug(),))["id"]
    conn.execute(
        "insert into config (tenant_id, key, value) values (%s, 'app.staff', %s)"
        " on conflict (tenant_id, key) do update set value = excluded.value",
        (t, json.dumps(SIGN_IN)),
    )
    report = people.import_staff(conn, SIGNER, apply=True)
    assert not report.refused, report.refused
    assert db.one(conn, "select count(*) as n from pii.staff where name = any(%s)", (NAMES,))["n"] == len(NAMES)
    written = conn.execute(
        "select schemaname as s, relname as t from pg_stat_xact_user_tables"
        " where n_tup_ins + n_tup_upd > 0 and schemaname <> 'pii'"
    ).fetchall()
    found = {}
    for w in written:
        where = sql.SQL("x::text ilike any(%s)")
        if (w["s"], w["t"]) == ("public", "config"):
            where = sql.SQL("x.key <> 'app.staff' and ") + where
        n = conn.execute(
            sql.SQL("select count(*) as n from {}.{} x where ").format(sql.Identifier(w["s"]), sql.Identifier(w["t"]))
            + where,
            ([f"%{name}%" for name in NAMES],),
        ).fetchone()["n"]
        if n:
            found[f"{w['s']}.{w['t']}"] = n
    assert found == {}, f"staff names outside pii (table: rows): {found}"
