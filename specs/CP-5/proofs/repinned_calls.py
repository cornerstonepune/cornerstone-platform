"""CP-5 item 5, second half (on the box): each function the CP-5 migration re-pins is called once, in a read-only
transaction that is rolled back, and no call fails to resolve a name.

The functions are the `alter function <signature> set search_path` lines of the migration whose name holds
`search_path` (the design's `<timestamp>_pin_function_search_paths.sql`). Each is called with NULL arguments; what a
changed search path breaks is name resolution, so a call that raises undefined function/table/column/object/schema
fails the proof. Other errors (a NULL refused, a write refused by the read-only transaction) are counted, not failed.
Trigger functions cannot be called directly and are listed as skipped. Prints signatures and SQLSTATEs, never rows.
Run on the box: packages/engine/.venv/bin/python specs/CP-5/proofs/repinned_calls.py
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "packages" / "engine"))

from engine.core import db  # noqa: E402

NAME_ERRORS = {"42883", "42P01", "42703", "42704", "3F000"}
ALTER = re.compile(r"alter\s+function\s+(.+?)\s+set\s+search_path\b", re.I | re.S)
CALL = """
    select p.prokind, p.prorettype::regtype::text as ret,
           p.oid::regproc::text as name,
           coalesce((select string_agg('null::' || format_type(t, null), ', ' order by i)
                     from unnest(p.proargtypes) with ordinality a(t, i)), '') as args
    from pg_proc p where p.oid = %s::regprocedure
"""


def main() -> int:
    migrations = sorted((ROOT / "supabase" / "migrations").glob("*search_path*.sql"))
    sigs = [s.strip().strip('"') for m in migrations for s in ALTER.findall(m.read_text())]
    if not sigs:
        print("no migration re-pins a function's search path (supabase/migrations/*search_path*.sql)")
        return 1
    failed, refused, skipped, ok = [], 0, [], 0
    with db.connect() as c:
        c.execute("set transaction read only")
        c.execute("set local statement_timeout = '5s'")
        for sig in sigs:
            f = c.execute(CALL, (sig,)).fetchone()
            if f["ret"] in ("trigger", "event_trigger") or f["prokind"] in ("a", "w"):
                skipped.append(sig)
                continue
            sql = ("call " if f["prokind"] == "p" else "select ") + f"{f['name']}({f['args']})"
            c.execute("savepoint s")
            try:
                c.execute(sql)
                ok += 1
            except Exception as e:  # noqa: BLE001  (a call's error is the measurement)
                state = getattr(e, "sqlstate", None) or "?"
                if state in NAME_ERRORS:
                    failed.append(f"{sig}: {state}")
                else:
                    refused += 1
            c.execute("rollback to savepoint s")
        c.rollback()
    print(f"{len(sigs)} re-pinned: {ok} ran, {refused} refused their NULL arguments or the read-only transaction, "
          f"{len(skipped)} trigger functions skipped, {len(failed)} could not resolve a name")
    print("\n".join("  " + s for s in failed + [f"{s}: skipped (trigger)" for s in skipped]))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
