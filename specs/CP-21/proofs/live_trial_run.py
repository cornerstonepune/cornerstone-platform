"""CP-21 item 8, LIVE (on the box, read-only): a trial run for the K2 class's next teaching fortnight prints its counts
and changes nothing.

The class is the one the school's sheet is loaded into (`engine timetable load --grade K2 --section A`, the committed
timetable run), in the academic year holding today. The next teaching fortnight is the first that starts after today.
The draft is the newest placed CP-11 run (issue #459) for that class and fortnight; without one the proof fails and
says so. The person is a current coordinator, looked up and handed to the command without ever being printed.

The command runs as `bin/engine timetable go-live … --dry` with every transaction read-only (PGOPTIONS), so it cannot
write even by mistake; this script itself only reads, in a read-only transaction. It prints counts and dates only:
never a name, an email or the school's text.
Run on the box: packages/engine/.venv/bin/python specs/CP-21/proofs/live_trial_run.py
"""

import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "packages" / "engine"))

from engine.core import db  # noqa: E402

TABLES = ("timetable_slot", "session", "plan_entry", "materials_line", "materials_line_source", "timetable_live",
          "timetable_run")


def counts(c) -> dict[str, int]:
    return {t: c.execute(f"select count(*) as n from {t}").fetchone()["n"] for t in TABLES}


def main() -> int:
    with db.connect() as c:
        c.execute("set transaction read only")
        t = db.one(c, "select id from tenant where slug = %s", (db.tenant_slug(),))["id"]
        tz = (c.execute("select value #>> '{}' as v from config where key = 'school.time_zone'").fetchone()
              or {"v": "Asia/Kolkata"})["v"]
        today = db.one(c, "select (now() at time zone %s)::date as d", (tz,))["d"]
        k = c.execute(
            "select c.id, c.section, y.label, y.id as year from school_class c join academic_year y on y.id ="
            " c.academic_year_id where c.tenant_id = %s and c.grade_code = 'K2' and c.section = 'A'"
            " and %s between y.starts_on and y.ends_on", (t, today)).fetchone()
        if k is None:
            print("FAIL: no K2 section A class in the academic year holding today")
            return 1
        fn = c.execute("select id, number, starts_on, ends_on from fortnight where academic_year_id = %s"
                       " and kind = 'teaching' and starts_on > %s order by starts_on limit 1",
                       (k["year"], today)).fetchone()
        if fn is None:
            print("FAIL: no teaching fortnight starts after today")
            return 1
        if c.execute("select to_regclass('public.timetable_run') as r").fetchone()["r"] is None:
            print("FAIL: the box has no timetable_run table: CP-11 (issue #459) is not deployed")
            return 1
        run = c.execute("select id from timetable_run where school_class_id = %s and fortnight_id = %s"
                        " and outcome = 'placed' order by created_at desc limit 1", (k["id"], fn["id"])).fetchone()
        if run is None:
            print(f"FAIL: no placed CP-11 run for fortnight {fn['number']}: make one with "
                  f"`bin/engine timetable generate --grade K2 --section A --year {k['label']} --fortnight {fn['number']}`")
            return 1
        by = c.execute(
            "select p.email from staff_role_grant g join pii.staff p on p.staff_id = g.staff_id"
            " where g.tenant_id = %s and g.role_code = 'coordinator' and g.valid_from <= %s"
            " and (g.valid_to is null or g.valid_to >= %s) order by g.valid_from limit 1", (t, today, today)).fetchone()
        if by is None:
            print("FAIL: no current coordinator to name with --by")
            return 1
        before = counts(c)
        c.rollback()

    env = {**os.environ, "PGOPTIONS": "-c default_transaction_read_only=on"}
    out = subprocess.run(
        [str(ROOT / "bin" / "engine"), "timetable", "go-live", "--grade", "K2", "--section", "A", "--year", k["label"],
         "--fortnight", str(fn["number"]), "--run", str(run["id"]), "--by", by["email"], "--dry"],
        capture_output=True, text=True, env=env, timeout=300)

    with db.connect() as c:
        c.execute("set transaction read only")
        after = counts(c)
        c.rollback()
    shown = sorted(set(re.findall(r"\d{4}-\d{2}-\d{2}", out.stdout)))
    inside = [d for d in shown if str(fn["starts_on"]) <= d <= str(fn["ends_on"])]
    print(f"fortnight {fn['number']} ({fn['starts_on']} to {fn['ends_on']}): trial run exit {out.returncode},"
          f" {len(inside)} of its dates shown")
    for name in TABLES:
        print(f"  {name}: {before[name]} before, {after[name]} after")
    # the command's own words are not printed: an error could carry the email it was given
    return 0 if out.returncode == 0 and inside and before == after else 1


if __name__ == "__main__":
    sys.exit(main())
