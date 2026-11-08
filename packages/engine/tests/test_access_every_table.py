"""Every table is child data or school-wide, and no child-data table lets everyone through (CP-4).

What is held here, on the database built from the migrations: the list covers every table both ways; school-wide
tables say why in one line; a table that plainly holds a child's data is never called school-wide; the website's rule
on a child-data table tests its key (never `true`), a school-wide table has the one open rule `web_all`, and no table
keeps the old `app_all`; a table made without a row fails `internal.apply_conventions()` by name. Who sees what, per
group, is `specs/CP-4/proofs/test_groups.py` (it builds a school and signs in as each group).
"""

import json
import os
import uuid
from pathlib import Path

import psycopg
import pytest

from engine.core import db

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")

REGISTER = Path(__file__).resolve().parents[3] / "supabase" / "seed" / "data_register.json"
# a paper's blueprint and the school's structure hold no child, though the register or a column names them
EXEMPT = {
    "public.sheet_template",
    "public.school_class",
    "public.campus",
    "public.academic_year",
    "public.role",
}
# child data in tables with no child_id column: they hang off a paper, a scan or an answer, or carry a class label
NO_CHILD_COLUMN = {
    "public.capture", "public.item_result", "public.narrative_observation", "public.gold", "public.page_choice",
    "public.capture_page", "public.mistake_named", "public.class_card", "public.class_card_confirmation",
}  # fmt: skip
OPEN_TO = ["app_web", "public", "authenticated", "anon"]


@pytest.fixture
def conn():
    with db.connect() as c:
        yield c
        c.rollback()


def _tables(conn) -> set[str]:
    return {
        r["t"]
        for r in conn.execute(
            "select n.nspname || '.' || c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace "
            "where n.nspname in ('public', 'pii') and c.relkind in ('r', 'p')"
        ).fetchall()
    }


def _classes(conn) -> dict[str, str]:
    rows = conn.execute(
        "select schema_name || '.' || table_name as t, data_class from access_table"
    ).fetchall()
    return {r["t"]: r["data_class"] for r in rows}


def test_the_list_covers_every_table_and_names_no_other(conn):
    tables, listed = _tables(conn), set(_classes(conn))
    assert not tables - listed, f"in no access_table row: {sorted(tables - listed)}"
    assert not listed - tables, f"rows naming no table: {sorted(listed - tables)}"


def test_a_school_wide_table_says_why_in_one_line(conn):
    bad = conn.execute(
        "select schema_name || '.' || table_name as t from access_table where data_class = 'school_wide' "
        "and (reason is null or btrim(reason) = '' or reason ~ '[\\r\\n]')"
    ).fetchall()
    assert not bad, [r["t"] for r in bad]


def test_a_table_that_holds_a_childs_data_is_not_called_school_wide(conn):
    register = json.loads(REGISTER.read_text())["data_register"]
    from_register = {t for entry in register for t in entry["tables"]}
    with_child_id = {
        r["t"]
        for r in conn.execute(
            "select table_schema || '.' || table_name as t from information_schema.columns "
            "where table_schema in ('public', 'pii') and column_name = 'child_id'"
        ).fetchall()
    }
    derived = {
        t
        for t in (from_register | with_child_id | NO_CHILD_COLUMN) & _tables(conn)
        if t not in EXEMPT and not t.startswith("public.access_")
    }
    assert {"public.capture", "public.item_result", "public.child", "public.evidence_event"} <= derived
    classes = _classes(conn)
    assert not [t for t in derived if classes.get(t) != "child_data"], "child data called school-wide"


def test_no_table_keeps_app_all_and_the_website_has_only_its_own_rule(conn):
    assert (
        conn.execute("select count(*) as n from pg_policies where policyname = 'app_all'").fetchone()["n"]
        == 0
    )
    classes = _classes(conn)
    for r in conn.execute(
        "select schemaname || '.' || tablename as t, array_agg(policyname::text) as names from pg_policies "
        "where roles && array['app_web']::name[] group by 1"
    ).fetchall():
        want = "web_rule" if classes[r["t"]] == "child_data" else "web_all"
        assert r["names"] == [want], (r["t"], r["names"])


def test_no_child_data_rule_allows_everyone(conn):
    rows = conn.execute(
        "select p.tablename, p.policyname from pg_policies p join access_table a on a.schema_name = p.schemaname "
        "and a.table_name = p.tablename where a.data_class = 'child_data' and p.roles && %s::name[] and ("
        "(p.cmd <> 'INSERT' and (p.qual is null or btrim(p.qual, ' ()') = 'true')) "
        "or (p.cmd not in ('SELECT', 'DELETE') and btrim(coalesce(p.with_check, p.qual, 'true'), ' ()') = 'true'))",
        (OPEN_TO,),
    ).fetchall()
    assert not rows, rows
    for r in conn.execute(
        "select a.table_name, a.key_column, p.qual from access_table a join pg_policies p "
        "on p.schemaname = a.schema_name and p.tablename = a.table_name and p.policyname = 'web_rule' "
        "where a.data_class = 'child_data'"
    ).fetchall():
        assert r["key_column"] in r["qual"], (r["table_name"], "the website's rule does not test its key")


def test_a_new_table_with_no_row_fails_the_rule_by_name(conn):
    name = f"cp4_unlisted_{uuid.uuid4().hex[:8]}"
    conn.execute(
        f"create table public.{name} (id uuid primary key default gen_random_uuid(), tenant_id uuid not null)"
    )
    with pytest.raises(psycopg.Error, match=name):
        with conn.transaction():
            conn.execute("select internal.apply_conventions()")
    conn.execute(
        "insert into access_table (schema_name, table_name, data_class, reason) values ('public', %s, 'school_wide', 'x')",
        (name,),
    )
    conn.execute("select internal.apply_conventions()")  # listed: it passes


def test_a_row_must_be_one_of_the_two_shapes(conn):
    for values in (
        "'child_data', null, null, null, null",  # child data with no kind or key
        "'school_wide', null, null, null, null",  # school-wide with no reason
        "'school_wide', 'children', 'id', 'child', 'a reason'",  # school-wide with a key
        "'school_wide', null, null, null, 'two\nlines'",
        "'neither', null, null, null, 'x'",
    ):
        with pytest.raises(psycopg.errors.CheckViolation), conn.transaction():
            conn.execute(
                "insert into access_table (schema_name, table_name, data_class, kind_code, key_column, key_type, reason)"
                f" values ('public', 'cp4_shape', {values})"
            )


def test_every_view_applies_the_callers_rules(conn):
    bad = conn.execute(
        "select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace "
        "where n.nspname in ('public', 'pii') and c.relkind = 'v' "
        "and not coalesce('security_invoker=true' = any(c.reloptions) or 'security_invoker=on' = any(c.reloptions), false)"
    ).fetchall()
    assert not bad, [r["relname"] for r in bad]
