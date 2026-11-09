"""CP-5 item 1 (LIVE, on the box): no function in the application schemas has a mutable search path.

The query is the one behind Supabase's advisor warning `function_search_path_mutable`: a function outside Supabase's
own schemas, not part of an extension, whose `proconfig` sets no `search_path`. Read-only transaction; prints the count
and the offending signatures (names of functions, never rows).
Run on the box: packages/engine/.venv/bin/python specs/CP-5/proofs/live_search_path.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "packages" / "engine"))

from engine.core import db  # noqa: E402

SUPABASE_OWN = (
    "auth", "cron", "extensions", "graphql", "graphql_public", "information_schema", "net", "pgbouncer", "pgmq",
    "pgsodium", "pgsodium_masks", "pgtle", "realtime", "_realtime", "_analytics", "repack", "storage",
    "supabase_functions", "supabase_migrations", "tiger", "topology", "vault",
)
MUTABLE = """
    select p.oid::regprocedure::text as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname <> all(%s)
      and n.nspname not like 'pg\\_%%'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search\\_path=%%')
    order by 1
"""


def main() -> int:
    with db.connect() as c:
        c.execute("set transaction read only")
        rows = c.execute(MUTABLE, (list(SUPABASE_OWN),)).fetchall()
        c.rollback()
    print(f"{len(rows)} function(s) with a mutable search path")
    for r in rows[:40]:
        print("  " + r["sig"])
    return 1 if rows else 0


if __name__ == "__main__":
    sys.exit(main())
