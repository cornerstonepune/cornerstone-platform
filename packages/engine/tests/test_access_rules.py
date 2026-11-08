"""CP-3 guards the Athena proofs do not hold: the registry is well formed and the helpers can read what they decide on.

The behaviour (who sees what) is proved in specs/CP-3/proofs; these read the structure back from the database."""

import os

import pytest

from engine.core import db

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")

HELPERS = [
    "internal.resolve_staff()",
    "public.signed_in_staff()",
    "public.my_tenant()",
    "public.my_reach(text)",
    "public.my_ids(text,text)",
]


@pytest.fixture
def conn():
    with db.connect() as c:
        yield c
        c.rollback()


def test_every_listed_table_has_a_tenant_column_and_its_key_column(conn):
    for r in conn.execute("select schema_name, table_name, key_column from access_table").fetchall():
        cols = {
            c["column_name"]
            for c in conn.execute(
                "select column_name from information_schema.columns where table_schema = %s and table_name = %s",
                (r["schema_name"], r["table_name"]),
            ).fetchall()
        }
        assert {"tenant_id", r["key_column"]} <= cols, r


def test_every_helper_is_owned_by_a_role_that_bypasses_row_security_and_is_closed_to_the_public(conn):
    for h in HELPERS:
        row = conn.execute(
            "select r.rolsuper or r.rolbypassrls as ok, p.prosecdef, p.proacl::text as acl from pg_proc p"
            " join pg_roles r on r.oid = p.proowner where p.oid = to_regprocedure(%s)",
            (h,),
        ).fetchone()
        assert row and row["ok"] and row["prosecdef"], h
        assert "anon=" not in (row["acl"] or "") and "authenticated=" not in (row["acl"] or ""), h
        assert not (row["acl"] or "").startswith("{=") and ",=X" not in (row["acl"] or ""), h


def test_a_group_with_no_reach_row_means_none(conn):
    """my_reach reads 'none' for a kind it has no row for."""
    assert conn.execute("select public.my_reach('no_such_kind') as r").fetchone()["r"] == "none"
