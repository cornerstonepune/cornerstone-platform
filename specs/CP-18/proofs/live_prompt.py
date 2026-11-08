"""CP-18 item 1, LIVE (box only, read-only): the active `materials_read` version on the live database is the one the
decisions-log line scored. Prints version numbers only."""

import os
import sys

import decisions as d
import psycopg


def main() -> int:
    line = d.score_line()
    if not line:
        print("DECISIONS-LOG.md has no line scoring materials_read")
        return 1
    version = d.logged_version(line)
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("DATABASE_URL is not set: the live check needs the production database")
        return 1
    with psycopg.connect(url, options="-c default_transaction_read_only=on", connect_timeout=15) as c:
        live = [r[0] for r in c.execute(
            "select version from prompt where purpose = %s and active order by version", (d.PURPOSE,))]
    print(f"scored v{version}; live active versions {live}")
    return 0 if live == [version] else 1


if __name__ == "__main__":
    sys.exit(main())
