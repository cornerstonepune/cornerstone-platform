"""CP-4 item 2 (LIVE, box only, read-only): no child-data table has a rule that allows everyone.

From pg_policies joined to access_table where data_class = 'child_data': no policy whose roles include app_web,
public, authenticated or anon has a using or check clause that is true or missing where its command needs one.
Prints counts and table/policy names only, never a row.
"""

import os
import sys

import psycopg

OPEN_TO = ["app_web", "public", "authenticated", "anon"]


def main() -> int:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("DATABASE_URL is not set: the live check needs the production database")
        return 1
    with psycopg.connect(url, options="-c default_transaction_read_only=on", connect_timeout=15) as conn:
        if conn.execute("select to_regclass('public.access_table') is null "
                        "or not exists (select from information_schema.columns where table_schema = 'public' "
                        "and table_name = 'access_table' and column_name = 'data_class')").fetchone()[0]:
            print("access_table with data_class is not on the live database")
            return 1
        child = conn.execute("select count(*) from public.access_table where data_class = 'child_data'").fetchone()[0]
        policies = conn.execute(
            "select count(*) from pg_policies p join public.access_table a on a.schema_name = p.schemaname "
            "and a.table_name = p.tablename where a.data_class = 'child_data'").fetchone()[0]
        unlisted = conn.execute(
            "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace "
            "where n.nspname in ('public', 'pii') and c.relkind in ('r', 'p') and not exists (select from "
            "public.access_table a where a.schema_name = n.nspname and a.table_name = c.relname)").fetchone()[0]
        opening = conn.execute(
            "select p.schemaname, p.tablename, p.policyname from pg_policies p join public.access_table a "
            "on a.schema_name = p.schemaname and a.table_name = p.tablename "
            "where a.data_class = 'child_data' and p.roles && %s::name[] and ("
            "  (p.cmd <> 'INSERT' and (p.qual is null or btrim(p.qual, ' ()') = 'true'))"
            "  or (p.cmd not in ('SELECT', 'DELETE') and btrim(coalesce(p.with_check, p.qual, 'true'), ' ()') = 'true'))"
            " order by 1, 2, 3", (OPEN_TO,)).fetchall()
    print(f"{child} child-data tables; {policies} policies on them; {len(opening)} allow everyone; "
          f"{unlisted} live tables not in access_table")
    for s, t, p in opening:
        print(f"  allows everyone: {s}.{t} ({p})")
    if child == 0:
        print("no table is listed as child data")
        return 1
    if unlisted:
        print("live tables missing from access_table: a child-data table there would escape this count")
        return 1
    return 1 if opening else 0


if __name__ == "__main__":
    sys.exit(main())
