"""CP-17 item 8 (LIVE, box only, read-only): every school has the four new settings and no item shows below zero in
any place.

In one read-only transaction on the live database: the count of schools missing any of `inventory.track_from_rupees`,
`inventory.record_items`, `inventory.record_roles`, `materials.approve_roles`; the count of `stock_on_hand` rows below
zero. Prints counts only, never a row, an item or a name.
"""

import os
import sys

import psycopg

KEYS = ["inventory.track_from_rupees", "inventory.record_items", "inventory.record_roles", "materials.approve_roles"]


def main() -> int:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("DATABASE_URL is not set: the live check needs the production database")
        return 1
    with psycopg.connect(url, options="-c default_transaction_read_only=on", connect_timeout=15) as conn:
        if conn.execute("select to_regclass('public.stock_on_hand') is null").fetchone()[0]:
            print("not on the live database: stock_on_hand")
            return 1
        # the view's number column: the one numeric column besides its keys (tenant, item, place)
        cols = [r[0] for r in conn.execute(
            "select column_name from information_schema.columns where table_schema = 'public'"
            " and table_name = 'stock_on_hand' and data_type in ('numeric', 'integer', 'bigint')")]
        if len(cols) != 1:
            print(f"stock_on_hand should have one number column, has {len(cols)}")
            return 1
        tenants = conn.execute("select count(*) from tenant").fetchone()[0]
        short = conn.execute(
            "select count(*) from tenant t where (select count(distinct c.key) from config c where c.tenant_id = t.id"
            " and c.key = any(%s)) <> %s", (KEYS, len(KEYS))).fetchone()[0]
        below = conn.execute(f'select count(*) from stock_on_hand where "{cols[0]}" < 0').fetchone()[0]
    print(f"{tenants} schools; {short} lack one of the four new settings; {below} item places below zero")
    if tenants == 0:
        print("no school on the live database")
        return 1
    return 0 if short == 0 and below == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
