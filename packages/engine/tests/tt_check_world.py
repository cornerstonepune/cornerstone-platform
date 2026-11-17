"""The made-up second class of the checker tests (CP-71): a Grade 2 class beside `tt_hand_world`'s K2 one, with two periods whose clock times
overlap one of K2's (04:50 to 05:30 against K2's 04:40 to 05:05) and one that overlaps none (07:00 to 07:30), and one educator who holds
Maths (`NUM`) for both. No child, no real name."""

import uuid
from typing import Any

from engine.core import db
from tests import tt_pattern_world as pw

TIMES = {"early": ("04:50", "05:30", 91), "late": ("07:00", "07:30", 92)}


def g2(c: db.Conn, w: dict) -> dict:
    """A Grade 2 class of the world's year with its two periods, and no cells."""
    klass = pw.empty_class(c, w, "G2")
    period = {
        name: str(
            db.one(
                c,
                "insert into period (tenant_id, grade_code, ord, starts_at, ends_at, label, fixed) values (%s, 'G2', %s, %s, %s, %s, false)"
                " returning id",
                (w["tenant"], o, a, b, f"G2 {name}"),
            )["id"]
        )
        for name, (a, b, o) in TIMES.items()
    }
    return {"class": klass, "period": period}


def educator(c: db.Conn, w: dict, holds: list[tuple[Any, str]]) -> str:
    """A staff member holding `subject_educator` for each (class, subject code)."""
    sid = db.one(
        c, "insert into staff (tenant_id, campus_id) values (%s, %s) returning id", (w["tenant"], w["campus"])
    )["id"]
    c.execute(
        "insert into pii.staff (tenant_id, staff_id, name, email) values (%s, %s, 'Test Person', %s)",
        (w["tenant"], sid, f"edu-{uuid.uuid4().hex[:8]}@example.org"),
    )
    for k, subject in holds:
        c.execute(
            "insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, subject_code, valid_from, granted_by)"
            " values (%s, %s, 'subject_educator', %s, %s, '2026-01-01', 'test')",
            (w["tenant"], sid, k, subject),
        )
    return str(sid)


def limit(
    c: db.Conn, w: dict, klass: Any, subject: str, span: str, most: int, weight: int | None = None
) -> None:
    c.execute(
        "insert into timetable_rule (tenant_id, school_class_id, kind, subject_code, span, most, weight)"
        " values (%s, %s, 'limit', %s, %s, %s, %s)",
        (w["tenant"], klass, subject, span, most, weight),
    )


def away(c: db.Conn, w: dict, staff: str, weekday: int, week: str | None = None) -> None:
    c.execute(
        "insert into timetable_rule (tenant_id, kind, staff_id, weekday, week_code, reason) values (%s, 'away', %s, %s, %s, 'away')",
        (w["tenant"], staff, weekday, week),
    )
