"""CP-6 item 7 (LIVE, box only, read-only), read for the fortnight: the current fortnight has a state row and the
settings rows exist.

In one read-only transaction on the live database: for every school with a teaching fortnight that has not ended, the
one containing today (Asia/Kolkata), or the next one when today falls in a break, has a `fortnight_cycle` row; every
school has its four `fortnight.*` step settings; `fortnight_edit` exists. Prints counts only, never a row or a name.
"""

import os
import sys

import psycopg

KEYS = ["fortnight.freeze", "fortnight.align", "fortnight.approve", "fortnight.list_sent"]


def main() -> int:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("DATABASE_URL is not set: the live check needs the production database")
        return 1
    with psycopg.connect(url, options="-c default_transaction_read_only=on", connect_timeout=15) as conn:
        missing = [t for t in ("fortnight_cycle", "fortnight_edit")
                   if conn.execute("select to_regclass(%s) is null", (f"public.{t}",)).fetchone()[0]]
        if missing:
            print(f"not on the live database: {', '.join(missing)}")
            return 1
        schools, with_row = conn.execute(
            "with today as (select (now() at time zone 'Asia/Kolkata')::date as d),"
            " current_fn as (select distinct on (f.tenant_id) f.tenant_id, f.id from fortnight f, today"
            "   where f.kind = 'teaching' and f.ends_on >= today.d order by f.tenant_id, f.starts_on)"
            " select count(*), count(c.fortnight_id) from current_fn cf"
            " left join fortnight_cycle c on c.fortnight_id = cf.id").fetchone()
        tenants = conn.execute("select count(*) from tenant").fetchone()[0]
        short = conn.execute(
            "select count(*) from tenant t where (select count(*) from config c where c.tenant_id = t.id"
            " and c.key = any(%s)) <> %s", (KEYS, len(KEYS))).fetchone()[0]
    print(f"{schools} schools with a current or next teaching fortnight; {with_row} have its state row; "
          f"{tenants} schools; {short} lack one of the four fortnight step settings")
    if schools == 0:
        print("no school has a current or next teaching fortnight")
        return 1
    return 0 if with_row == schools and short == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
