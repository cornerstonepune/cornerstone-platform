"""CP-9 item 1, LIVE (box only, read-only): the nightly job has run and logged.

A `graph_run` row with `ok` exists whose `ran_at` is within the config row `graph.nightly_stale_hours` (26 when the row
is absent) of now: a flow that never fires leaves no row, so a stale ledger fails. Prints counts and times only.
"""

import os
import sys

import psycopg


def main() -> int:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("DATABASE_URL is not set: the live check needs the production database")
        return 1
    with psycopg.connect(url, options="-c default_transaction_read_only=on", connect_timeout=15) as conn:
        if conn.execute("select to_regclass('public.graph_run') is null").fetchone()[0]:
            print("graph_run is not on the live database: the nightly job's ledger does not exist yet")
            return 1
        hours = conn.execute("select coalesce((select (value #>> '{}')::numeric from config"
                             " where key = 'graph.nightly_stale_hours' limit 1), 26)").fetchone()[0]
        runs, ok, fresh, last = conn.execute(
            "select count(*), count(*) filter (where ok),"
            " count(*) filter (where ok and ran_at >= now() - make_interval(hours => %s::int)),"
            " max(ran_at) filter (where ok) from graph_run", (int(hours),)).fetchone()
    print(f"{runs} nightly runs logged, {ok} ok; {fresh} ok within the last {int(hours)} hours; last ok run: {last}")
    if not fresh:
        print("no ok run within the window: the nightly flow has not fired (is it imported into n8n with the key?)")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
