"""CP-9 item 6, LIVE (box only, read-only): the nightly rebuild leaves the existing evidence records and child states
unchanged (1,838 evidence records and 283 child states when the scope was written).

From the ledger `graph_run`: every run has `evidence_digest_before = _after` and `states_digest_before = _after`; the
first run (lowest `started_at`) has its state counts equal before and after; and the evidence created before that first
run is still all there (its count today equals the first run's `evidence_rows`). Prints counts only, never a row.
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
            print("graph_run is not on the live database: the nightly job has never run there")
            return 1
        runs, bad = conn.execute(
            "select count(*), count(*) filter (where evidence_digest_before is distinct from evidence_digest_after"
            " or states_digest_before is distinct from states_digest_after) from graph_run").fetchone()
        first = conn.execute(
            "select started_at, evidence_rows, skill_states_before, skill_states_after, observed_states_before,"
            " observed_states_after from graph_run order by started_at, id limit 1").fetchone()
        evidence, skill, seen = conn.execute(
            "select (select count(*) from evidence_event), (select count(*) from child_skill_state),"
            " (select count(*) from child_observed_state)").fetchone()
        kept = first and conn.execute("select count(*) from evidence_event where created_at < %s",
                                      (first[0],)).fetchone()[0]
    print(f"{runs} runs; {bad} with a digest that moved; today {evidence} evidence records, {skill} skill states, "
          f"{seen} observed states")
    if not first:
        print("no nightly run is logged yet")
        return 1
    _, rows, sb, sa, ob, oa = first
    print(f"first run: {rows} evidence records before it ({kept} of them still there today); "
          f"skill states {sb} -> {sa}; observed states {ob} -> {oa}")
    if bad or sb != sa or ob != oa or kept != rows:
        print("the rebuild changed what it must not")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
