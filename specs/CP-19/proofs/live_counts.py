"""CP-19 item 8 (LIVE, box only, read-only): for the current fortnight, every per-class figure of
`coordinator_counts` agrees with an independent direct count (hand_counts.py) on the production database.

Read-only: the connection is opened with default_transaction_read_only=on and nothing is written. Prints counts and
measure names only: never a name, never a child's or a person's id.
"""

import os
import sys
from pathlib import Path

import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parent))
from hand_counts import MEASURES, by_class, function_by_class  # noqa: E402


def main() -> int:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("DATABASE_URL is not set: the live check needs the production database")
        return 1
    with psycopg.connect(url, options="-c default_transaction_read_only=on", connect_timeout=15) as c:
        if c.execute("select to_regprocedure('public.coordinator_counts(uuid)') is null").fetchone()[0]:
            print("coordinator_counts(uuid) is not on the live database")
            return 1
        current = [r[0] for r in c.execute(
            "select f.id from fortnight f where (now() at time zone coalesce((select value #>> '{}' from config z"
            " where z.tenant_id = f.tenant_id and z.key = 'school.time_zone'), 'Asia/Kolkata'))::date"
            " between f.starts_on and f.ends_on").fetchall()]
        if not current:
            print("no fortnight on the live database contains today")
            return 1
        compared = bad = 0
        for f in current:
            got = function_by_class(c.execute(
                "select school_class_id, staff_id, measure, n from public.coordinator_counts(%s)", (f,)).fetchall())
            classes = sorted({k[0] for k in got})
            want = by_class(c, f, classes)
            for (cls, m), n in want.items():
                compared += 1
                if got.get((cls, m), 0) != n:
                    bad += 1
                    print(f"disagree: {m}: function {got.get((cls, m), 0)}, direct {n}")
            print(f"fortnight {current.index(f) + 1} of {len(current)}: {len(classes)} classes, "
                  f"{len(MEASURES)} measures each")
        print(f"{compared} figures compared, {bad} disagree")
        if compared == 0:
            print("coordinator_counts returned no class for the current fortnight")
            return 1
        return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
