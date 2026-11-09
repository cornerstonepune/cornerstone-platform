"""CP-12 item 8, the part a throwaway database can show: the move history and clash acceptance exist with role rules
on (row-level security, and CP-4's `access_table` rows: the move history is class data keyed by `school_class_id`, an
acceptance is school-wide). The same facts are read on the box by live_clashes.py."""

from conftest import needs

EXPECTED = {"timetable_move": ("child_data", "school_class_id"), "timetable_clash_accept": ("school_wide", None)}


def test_the_move_history_and_clash_acceptance_exist_with_role_rules_on(conn):
    needs(conn, "public.access_table", "CP-4 (the access table list, issue #452)")
    for table, (data_class, key) in EXPECTED.items():
        needs(conn, f"public.{table}", "CP-12 (this scope)")
        rls = conn.execute("select relrowsecurity from pg_class where oid = %s::regclass", (f"public.{table}",))
        assert rls.fetchone()["relrowsecurity"], f"{table} has row-level security off"
        policies = conn.execute("select count(*) as n from pg_policies where schemaname = 'public' and tablename = %s",
                                (table,)).fetchone()["n"]
        assert policies > 0, f"{table} has no role rule"
        row = conn.execute("select data_class, key_column from access_table where schema_name = 'public'"
                           " and table_name = %s", (table,)).fetchone()
        assert row is not None, f"{table} is not in access_table"
        assert (row["data_class"], row["key_column"]) == (data_class, key), f"{table}: {dict(row)}"
