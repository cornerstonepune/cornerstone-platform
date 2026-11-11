"""For tests/u77-go-live.spec.ts: keep a placed draft for a class and fortnight that swaps two different subjects on the first day, as
the engine's own go-live test does (packages/engine/tests/test_timetable_go_live.py `swapped_draft`, `a_run`), so Go live has something
to change. Run with the engine's own Python against the test database (DATABASE_URL). Prints the new run's id as JSON."""

import json
import sys

from engine.core import db
from engine.w2_print import tt_generate as gen
from engine.w2_print import tt_need as need

grade, section, year, number = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
with db.connect() as conn:
    i = need.load(conn, grade, section, year, number)
    cells = conn.execute(
        "select d.on_date, s.period_id::text as p, s.subject_code from session s join school_day d on d.id = s.school_day_id"
        " where s.school_class_id = %s and s.state = 'planned' and d.on_date between %s and %s order by d.on_date, s.period_id",
        (i.class_id, i.days[0].date, i.days[-1].date),
    ).fetchall()
    week = {d.date: d.week for d in i.days}
    subject = [c for c in cells if i.frame.get((week[c["on_date"]], c["on_date"].isoweekday(), c["p"]), ("",))[0] == "subject"]
    first = subject[0]
    other = next(c for c in subject if c["on_date"] == first["on_date"] and c["subject_code"] != first["subject_code"])
    swap = {first["p"]: other["subject_code"], other["p"]: first["subject_code"]}
    draft = [
        {
            "date": c["on_date"].isoformat(),
            "week": week[c["on_date"]],
            "period_id": c["p"],
            "subject_code": swap.get(c["p"], c["subject_code"]) if c["on_date"] == first["on_date"] else c["subject_code"],
        }
        for c in subject
    ]
    run = conn.execute(
        "insert into timetable_run (tenant_id, school_class_id, fortnight_id, outcome, needed, placed, input_text, fet_version, seed,"
        " solve_seconds, draft) values (%s, %s, %s, 'placed', 0, 0, %s, 'FET 6.8.5', 1, 1, %s) returning id",
        (i.tenant_id, i.class_id, i.fortnight_id, gen.input_text(i, "FET 6.8.5"), json.dumps(draft)),
    ).fetchone()["id"]
    conn.commit()
    print(json.dumps({"run": str(run), "day": first["on_date"].isoformat()}))
