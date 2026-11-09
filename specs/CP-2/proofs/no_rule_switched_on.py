"""CP-2 item 6 (LIVE, box only, read-only): no rule is switched on and no row becomes invisible because of CP-2.

- The migration(s) that define public.current_staff() contain no policy and no row-level-security statement.
- On the live database, the function exists, and every live policy that calls current_staff() is created by some
  other migration (none before CP-3, so today: no live policy calls it).
Prints counts and policy names only, never a row.
"""

import os
import re
import sys
from pathlib import Path

import psycopg

ROOT = Path(os.environ["ATHENA_ROOT"])
DEFINES = re.compile(r"function\s+(public\.)?current_staff\s*\(", re.I)
RULE_DDL = re.compile(r"\b(create|alter|drop)\s+policy\b|\brow\s+level\s+security\b", re.I)


def main() -> int:
    migrations = sorted((ROOT / "supabase" / "migrations").glob("*.sql"))
    ours = [m for m in migrations if DEFINES.search(m.read_text())]
    if not ours:
        print("no migration defines public.current_staff()")
        return 1
    bad = [m.name for m in ours if RULE_DDL.search(m.read_text())]
    if bad:
        print(f"CP-2's migration switches a rule on or changes one: {bad}")
        return 1
    others = "\n".join(m.read_text() for m in migrations if m not in ours)

    url = os.environ.get("DATABASE_URL")
    if not url:
        print("DATABASE_URL is not set: the live check needs the production database")
        return 1
    with psycopg.connect(url, options="-c default_transaction_read_only=on", connect_timeout=15) as conn:
        if conn.execute("select to_regprocedure('public.current_staff()') is null").fetchone()[0]:
            print("public.current_staff() is not on the live database")
            return 1
        total = conn.execute("select count(*) from pg_policies").fetchone()[0]
        calling = conn.execute(
            "select schemaname, tablename, policyname from pg_policies "
            "where coalesce(qual, '') ilike '%current_staff%' or coalesce(with_check, '') ilike '%current_staff%'"
        ).fetchall()
    print(f"{total} live policies; {len(calling)} call current_staff()")
    unexplained = [f"{s}.{t}:{p}" for s, t, p in calling if p not in others]
    if unexplained:
        print(f"live policies call current_staff() with no migration but CP-2's to explain them: {unexplained}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
