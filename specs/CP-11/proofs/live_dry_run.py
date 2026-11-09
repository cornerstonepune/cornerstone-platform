"""CP-11 item 6 (LIVE, box only, read-only): a dry run for the K2 class's current or next teaching fortnight places
every needed lesson and writes nothing (row counts equal before and after).

In a read-only transaction on the live database: each K2 class of the school's current academic year (Asia/Kolkata
today), and the teaching fortnight of that year containing today, or the next one when today falls in a break. For
each, `engine timetable generate --grade K2 --section … --year … --fortnight … --dry` is run inside the running engine
container (`deploy-engine-1`, as the deploy runs its commands); it must print `needed <n>` and `placed <n>` with
n > 0 and equal, and no failure outcome. The row counts of the timetable tables, the sessions, the plan lines and the
kept runs are the same before and after. Prints counts only: never a row, a name, the draft or the command's output.
"""

import os
import re
import subprocess
import sys
from pathlib import Path

import psycopg

ROOT = Path(__file__).resolve().parents[3]
TABLES = ["timetable_run", "timetable_slot", "timetable_block", "timetable_limit", "timetable_rule_edit", "session",
          "plan_entry"]
CONTAINER = os.environ.get("ENGINE_CONTAINER", "deploy-engine-1")


def _url() -> str | None:
    if os.environ.get("DATABASE_URL"):
        return os.environ["DATABASE_URL"]
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("DATABASE_URL="):
                return line.split("=", 1)[1].strip().strip("'\"")
    return None


def _counts(conn) -> dict[str, int]:
    return {t: conn.execute(f"select count(*) from public.{t}").fetchone()[0] for t in TABLES}


def _dry(args: list[str]) -> subprocess.CompletedProcess:
    cmd = ["docker", "exec", CONTAINER, "engine", "timetable", "generate", *args, "--dry"]
    out = subprocess.run(cmd, capture_output=True, text=True, timeout=900)
    if out.returncode != 0 and "permission denied" in out.stderr.lower():
        out = subprocess.run(["sudo", "-n", *cmd], capture_output=True, text=True, timeout=900)
    return out


def main() -> int:
    url = _url()
    if not url:
        print("DATABASE_URL is not set (env or .env): the live check needs the production database")
        return 1
    slug = os.environ.get("TENANT_SLUG", "cornerstone-pune")
    ro = "-c default_transaction_read_only=on"
    with psycopg.connect(url, options=ro, connect_timeout=15) as conn:
        if conn.execute("select to_regclass('public.timetable_run') is null").fetchone()[0]:
            print("not on the live database: timetable_run")
            return 1
        targets = conn.execute(
            "with today as (select (now() at time zone 'Asia/Kolkata')::date as d)"
            " select c.section, y.label, (select f.number from fortnight f where f.academic_year_id = y.id"
            "   and f.kind = 'teaching' and f.ends_on >= today.d order by f.starts_on limit 1)"
            " from school_class c join academic_year y on y.id = c.academic_year_id"
            " join tenant t on t.id = c.tenant_id, today"
            " where t.slug = %s and c.grade_code = 'K2' and today.d between y.starts_on and y.ends_on"
            " order by c.section", (slug,)).fetchall()
        before = _counts(conn)
    if not targets:
        print("no K2 class in the current academic year")
        return 1
    ok = True
    for i, (section, year, number) in enumerate(targets, 1):
        if number is None:
            print(f"K2 class {i}: no current or next teaching fortnight")
            ok = False
            continue
        out = _dry(["--grade", "K2", "--section", section, "--year", year, "--fortnight", str(number)])
        needed = re.search(r"\bneeded\s*:?\s*(\d+)", out.stdout, re.I)
        placed = re.search(r"\bplaced\s*:?\s*(\d+)", out.stdout, re.I)
        failed = re.search(r"unmeetable|not_found_in_time|no timetable found", out.stdout, re.I)
        n, p = (int(needed.group(1)) if needed else None), (int(placed.group(1)) if placed else None)
        print(f"K2 class {i}, fortnight {number}: exit {out.returncode}, needed {n}, placed {p}"
              + (", reported a failure outcome" if failed else ""))
        ok = ok and out.returncode == 0 and n is not None and n > 0 and n == p and not failed
    with psycopg.connect(url, options=ro, connect_timeout=15) as conn:
        after = _counts(conn)
    moved = {t: (before[t], after[t]) for t in TABLES if before[t] != after[t]}
    print(f"row counts before and after: {'equal' if not moved else moved} ({sum(after.values())} rows in "
          f"{len(TABLES)} tables)")
    return 0 if ok and not moved else 1


if __name__ == "__main__":
    sys.exit(main())
