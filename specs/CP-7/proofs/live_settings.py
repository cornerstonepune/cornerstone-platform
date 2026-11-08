"""CP-7 item 10 (LIVE, box only, read-only): the two settings rows exist for every school and the new tables exist.

In one read-only transaction on the live database: `to_regclass` is not null for `public.fortnight_plan` and
`public.fortnight_plan_line`, and no school (`tenant`) lacks either `fortnight.no_roll_forward` or
`fortnight.approver_groups` in `config`. Prints counts only, never a row, a value or a name.
"""

import os
import sys
from pathlib import Path

import psycopg

KEYS = ["fortnight.no_roll_forward", "fortnight.approver_groups"]
TABLES = ["public.fortnight_plan", "public.fortnight_plan_line"]


def database_url() -> str | None:
    if url := os.environ.get("DATABASE_URL"):
        return url
    env = Path(__file__).resolve().parents[3] / ".env"
    lines = env.read_text().splitlines() if env.exists() else []
    found = [ln.split("=", 1)[1].strip() for ln in lines if ln.startswith("DATABASE_URL=")]
    return found[-1] if found else None


def main() -> int:
    url = database_url()
    if not url:
        print("DATABASE_URL is not set (env or .env): the live check needs the production database")
        return 1
    with psycopg.connect(url, options="-c default_transaction_read_only=on", connect_timeout=15) as conn:
        missing = [t for t in TABLES if conn.execute("select to_regclass(%s) is null", (t,)).fetchone()[0]]
        schools = conn.execute("select count(*) from tenant").fetchone()[0]
        short = conn.execute(
            "select count(*) from tenant t where (select count(distinct c.key) from config c where c.tenant_id = t.id"
            " and c.key = any(%s)) <> %s", (KEYS, len(KEYS))).fetchone()[0]
    print(f"{len(TABLES) - len(missing)} of {len(TABLES)} new tables exist; {schools} schools; "
          f"{short} lack one of the two fortnight settings rows")
    if missing:
        print(f"not on the live database: {', '.join(missing)}")
    return 0 if not missing and schools > 0 and short == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
