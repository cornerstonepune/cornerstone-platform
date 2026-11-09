"""CP-4 item 4: a new table added without being listed fails a check in CI.

Every migration ends with `select internal.apply_conventions()`, and CI builds its database from the migrations, so a
migration that creates a table and lists it nowhere must fail there: apply_conventions() raises, naming the table. The
coverage check (every table has an access_table row) flags it too. Listing the same table makes both pass, so the
failure is about the listing and nothing else. All in one transaction, rolled back.
"""

import uuid

import psycopg
import pytest

from conftest import coverage_gaps


@pytest.fixture
def new_table(conn):
    name = f"cp4_unlisted_{uuid.uuid4().hex[:8]}"
    conn.execute(f"create table public.{name} (id uuid primary key default gen_random_uuid(), "
                 "tenant_id uuid not null, note text)")
    return name


def test_4_apply_conventions_raises_naming_the_unlisted_table(conn, new_table):
    with pytest.raises(psycopg.Error) as raised:
        with conn.transaction():
            conn.execute("select internal.apply_conventions()")
    assert new_table in str(raised.value), f"apply_conventions() failed, but not naming {new_table}: {raised.value}"


def test_4_coverage_check_flags_the_unlisted_table(conn, new_table):
    unlisted, _ = coverage_gaps(conn)
    assert f"public.{new_table}" in unlisted


def test_4_listing_the_table_makes_it_pass(conn, new_table):
    conn.execute("insert into public.access_table (schema_name, table_name, data_class, reason) "
                 "values ('public', %s, 'school_wide', 'proof table, rolled back')", (new_table,))
    conn.execute("select internal.apply_conventions()")
    assert f"public.{new_table}" not in coverage_gaps(conn)[0]
    names = {r[0] for r in conn.execute("select policyname from pg_policies where schemaname = 'public' "
                                         "and tablename = %s", (new_table,))}
    assert "app_all" not in names and "engine_all" in names, names
