"""The made-up school of the solver tests (CP-75): `tt_hand_world`'s 2033 K2 class (Maths every day at 04:40, every cell a person's) plus a
Grade 2 and a Grade 3 class with a fixed assembly and six free periods a day, the same clock times in both. One educator holds Maths in all
three classes, one holds Hindi in Grades 2 and 3 and is away on Fridays, and each grade has its class teacher. Weekly counts are limits
(20 lessons a week in 30 places). Grade 2 has three cells a person set and one machine-made cell. No child, no real name."""

from typing import Any

from engine.core import db
from tests import tt_check_world as cw
from tests import tt_hand_world as tw
from tests import tt_pattern_world as pw

STARTS = (
    "04:10",
    "04:40",
    "05:20",
    "06:00",
    "06:40",
    "07:20",
    "08:00",
)  # the first is the fixed assembly; 40 minutes each
WEEKLY = {"NUM": 5, "ENG": 5, "HIN": 3, "SCI": 3, "ART": 2, "PE": 2}
PERSON = [("p3", "A", 1, "NUM", "Maths"), ("p2", "B", 2, "ENG", "English"), ("p4", "A", 3, "HIN", "Hindi")]
MACHINE = ("p5", "A", 1, "SCI", "Science")


def _class(c: db.Conn, w: dict, grade: str) -> dict:
    klass = pw.empty_class(c, w, grade)
    period = {}
    for i, at in enumerate(STARTS):
        period[f"p{i}"] = str(
            db.one(
                c,
                "insert into period (tenant_id, grade_code, ord, starts_at, ends_at, label, fixed) values (%s, %s, %s, %s,"
                " %s::time + interval '40 minutes', %s, %s) returning id",
                (w["tenant"], grade, 80 + i, at, at, f"{grade} p{i}", i == 0),
            )["id"]
        )
    teacher = db.one(
        c, "insert into staff (tenant_id, campus_id) values (%s, %s) returning id", (w["tenant"], w["campus"])
    )["id"]
    c.execute(
        "insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, valid_from, granted_by)"
        " values (%s, %s, 'class_teacher', %s, '2026-01-01', 'test')",
        (w["tenant"], teacher, klass),
    )
    for subject, n in WEEKLY.items():
        limit(c, w, klass, subject, "week", fewest=n)
    limit(c, w, klass, "NUM", "day", most=1, weight=5)  # Try to: Maths once a day
    limit(c, w, klass, "ENG", "day", most=1)  # Must: English once a day
    return {"class": klass, "period": period}


def limit(
    c: db.Conn,
    w: dict,
    klass: Any,
    subject: str,
    span: str,
    *,
    fewest: int | None = None,
    most: int | None = None,
    weight: int | None = None,
) -> str:
    return str(
        db.one(
            c,
            "insert into timetable_rule (tenant_id, school_class_id, kind, subject_code, span, fewest, most, weight)"
            " values (%s, %s, 'limit', %s, %s, %s, %s, %s) returning id",
            (w["tenant"], klass, subject, span, fewest, most, weight),
        )["id"]
    )


def cell(
    c: db.Conn,
    w: dict,
    g: dict,
    period: str,
    week: str,
    weekday: int,
    subject: str,
    text: str,
    source: str,
    on,
) -> None:
    c.execute(
        "insert into timetable_rule (tenant_id, school_class_id, kind, period_id, week_code, weekday, cell, subject_code, text, valid_from,"
        " source) values (%s, %s, 'frame', %s, %s, %s, 'subject', %s, %s, %s, %s)",
        (w["tenant"], g["class"], g["period"][period], week, weekday, subject, text, on, source),
    )


def school(c: db.Conn, on) -> dict:
    w = tw.school(c)
    w["g2"], w["g3"] = _class(c, w, "G2"), _class(c, w, "G3")
    both = [(w["g2"]["class"], s) for s in ("NUM", "HIN")] + [(w["g3"]["class"], s) for s in ("NUM", "HIN")]
    w["maths"] = cw.educator(c, w, [(w["class"], "NUM")] + [x for x in both if x[1] == "NUM"])
    w["hindi"] = cw.educator(c, w, [x for x in both if x[1] == "HIN"])
    cw.away(c, w, w["hindi"], 5)
    for p, wk, wd, subject, text in PERSON:
        cell(c, w, w["g2"], p, wk, wd, subject, text, "person", on)
    cell(c, w, w["g2"], *MACHINE, "machine", on)
    w["fill"] = [w["g2"]["class"], w["g3"]["class"]]
    return w


def pattern(c: db.Conn, w: dict, on) -> list[tuple]:
    """Every pattern row of the three classes as it stands, to show a solve wrote nothing."""
    ids = [str(w["class"]), *w["fill"]]
    return [tuple(r.values()) for r in c.execute(
        "select school_class_id::text, period_id::text, week_code, weekday, cell, subject_code, text, source, valid_from, valid_to"
        " from timetable_rule where kind = 'frame' and school_class_id::text = any(%s) order by 1, 2, 3, 4, 9", (ids,)).fetchall()]  # fmt: skip
