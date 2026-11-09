"""CP-12 item 8, LIVE (on the box, read-only): the move history and clash acceptance exist with role rules on, and the
clash count per fortnight is printed. Counts and fortnight numbers only: never a name, an email or the school's text.
Every query runs in one read-only transaction, rolled back.
Run on the box: packages/engine/.venv/bin/python specs/CP-12/proofs/live_clashes.py
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "packages" / "engine"))

from engine.core import db

TABLES = ("timetable_move", "timetable_clash_accept")


def main() -> int:
    ok = True
    with db.connect() as c:
        c.execute("set transaction read only")
        for name in (*TABLES, "timetable_clash", "access_table"):
            if c.execute("select to_regclass(%s) as r", (f"public.{name}",)).fetchone()["r"] is None:
                print(f"FAIL: the box has no {name}")
                ok = False
        if not ok:
            c.rollback()
            return 1
        for t in TABLES:
            rls = c.execute("select relrowsecurity as on from pg_class where oid = %s::regclass", (f"public.{t}",))
            on = rls.fetchone()["on"]
            policies = c.execute("select count(*) as n from pg_policies where schemaname = 'public' and tablename = %s",
                                 (t,)).fetchone()["n"]
            listed = c.execute("select count(*) as n from access_table where schema_name = 'public' and table_name = %s",
                               (t,)).fetchone()["n"]
            rows = c.execute(f"select count(*) as n from {t}").fetchone()["n"]
            print(f"{t}: {rows} rows, row-level security {'on' if on else 'OFF'}, {policies} role rules,"
                  f" {'listed' if listed else 'NOT listed'} in access_table")
            ok = ok and on and policies > 0 and listed == 1
        per = c.execute(
            "select coalesce('FN' || f.number::text, f.starts_on::text || ' to ' || f.ends_on::text) as fortnight,"
            " count(*) as clashes, count(*) filter (where not k.accepted) as open"
            " from timetable_clash k join fortnight f on f.id = k.fortnight_id"
            " group by f.number, f.starts_on, f.ends_on order by f.starts_on").fetchall()
        print(f"clashes per fortnight ({len(per)} fortnights with any):")
        for r in per:
            print(f"  {r['fortnight']}: {r['clashes']} clashes, {r['open']} not accepted")
        c.rollback()
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
