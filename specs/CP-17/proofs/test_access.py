"""CP-17 item 7, first half: every new table has its access rule (CP-4's `access_table`), and every materials test
that existed when CP-17 was scoped is still there under its name (the second half, `item7.sh`, runs them).
- `stock_move` is `school_wide` with a one-line reason;
- `materials_list_approval` is `child_data`, keyed on `class_id`, read like the list it approves (the same `kind_code`
  and `key_type` as `materials_list`'s row);
- no table in the database is missing from `access_table` (CP-4's own rule; a new table without a row fails here too).
Needs CP-4 (`access_table.data_class`): until it is merged these proofs fail saying so."""

import re

from existing_materials_tests import EXISTING

from cp17_world import ROOT_DIR, conn, needs, needs_column  # noqa: F401  (fixtures)

CP4 = "CP-4 (access rules: access_table.data_class)"


def _row(conn, table):
    return conn.execute("select * from public.access_table where schema_name = 'public' and table_name = %s",
                        (table,)).fetchone()


def test_7_the_new_tables_exist(conn):
    needs(conn, "public.stock_move", "its own migration (CP-17)")
    needs(conn, "public.materials_list_approval", "its own migration (CP-17)")


def test_7_stock_move_is_school_wide_with_a_reason(conn):
    needs_column(conn, "access_table", "data_class", CP4)
    row = _row(conn, "stock_move")
    assert row is not None, "stock_move has no access_table row"
    assert row["data_class"] == "school_wide"
    assert row["reason"] and row["reason"].strip() and "\n" not in row["reason"]


def test_7_an_approval_is_read_like_the_list_it_approves(conn):
    needs_column(conn, "access_table", "data_class", CP4)
    row, lst = _row(conn, "materials_list_approval"), _row(conn, "materials_list")
    assert row is not None, "materials_list_approval has no access_table row"
    assert lst is not None, "materials_list has no access_table row"
    assert (row["data_class"], row["key_column"]) == ("child_data", "class_id")
    assert (row["kind_code"], row["key_type"]) == (lst["kind_code"], lst["key_type"])


def test_7_every_table_has_an_access_rule(conn):
    needs_column(conn, "access_table", "data_class", CP4)
    unlisted = [r["t"] for r in conn.execute(
        "select n.nspname || '.' || c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace"
        " where n.nspname in ('public', 'pii') and c.relkind in ('r', 'p') and not exists (select 1 from"
        " public.access_table a where a.schema_name = n.nspname and a.table_name = c.relname) order by 1")]
    assert not unlisted, f"tables with no access rule: {unlisted}"


def test_7_every_existing_materials_test_is_still_there():
    gone = []
    for path, names in EXISTING.items():
        f = ROOT_DIR / path
        have = set(re.findall(r"^(?:async )?def (test_\w+)", f.read_text(), re.M)) if f.exists() else set()
        gone += [f"{path}::{n}" for n in names if n not in have]
    assert not gone, f"existing materials tests removed or renamed: {gone}"
