"""CP-9 item 1, LIVE (box only, read-only): the nightly job has run and logged.

A nightly run (a row of the run list, flow `graph_nightly`; CP-27 group 6: once the ledger `graph_run`) with `ok` exists whose `ran_at` is within the config row `graph.nightly_stale_hours` (26 when the row
is absent) of now: a flow that never fires leaves no row, so a stale ledger fails. Prints counts and times only.
"""

import os
import sys

import psycopg

RUNS = ("(select started_at, finished_at as ran_at, status = 'ok' as ok,"
    " (result ->> 'evidence_rows')::int as evidence_rows,"
    " result ->> 'evidence_digest_before' as evidence_digest_before,"
    " result ->> 'evidence_digest_after' as evidence_digest_after,"
    " result ->> 'states_digest_before' as states_digest_before,"
    " result ->> 'states_digest_after' as states_digest_after,"
    " (result ->> 'skill_states_before')::int as skill_states_before,"
    " (result ->> 'skill_states_after')::int as skill_states_after,"
    " (result ->> 'observed_states_before')::int as observed_states_before,"
    " (result ->> 'observed_states_after')::int as observed_states_after, id"
    " from flow_run where flow = 'graph_nightly') g")


def main() -> int:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("DATABASE_URL is not set: the live check needs the production database")
        return 1
    with psycopg.connect(url, options="-c default_transaction_read_only=on", connect_timeout=15) as conn:
        hours = conn.execute("select coalesce((select (value #>> '{}')::numeric from config"
                             " where key = 'graph.nightly_stale_hours' limit 1), 26)").fetchone()[0]
        runs, ok, fresh, last = conn.execute(
            "select count(*), count(*) filter (where ok),"
            " count(*) filter (where ok and ran_at >= now() - make_interval(hours => %s::int)),"
            " max(ran_at) filter (where ok) from RUNS".replace("RUNS", RUNS), (int(hours),)).fetchone()
    print(f"{runs} nightly runs logged, {ok} ok; {fresh} ok within the last {int(hours)} hours; last ok run: {last}")
    if not fresh:
        print("no ok run within the window: the nightly flow has not fired (is it imported into n8n with the key?)")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
