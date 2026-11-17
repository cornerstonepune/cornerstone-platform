"""The made-up school of the pattern-builder tests (CP-71): the 2033 K2 class of `tt_hand_world` (four periods, the first fixed, a
two-week frame, one published fortnight) plus an empty class of another grade, and the pattern as a plain list of cells. No child, no real
name, no Drive id."""

import uuid
from typing import Any

from engine.core import db
from engine.w2_print import tt_pattern


def empty_class(c: db.Conn, w: dict, grade: str = "G2") -> str:
    """A class of the world's year in `grade`, with no day shape and no rule."""
    return str(
        db.one(
            c,
            "insert into school_class (tenant_id, campus_id, academic_year_id, grade_code, section)"
            " values (%s, %s, %s, %s, %s) returning id",
            (w["tenant"], w["campus"], w["year"], grade, f"P{uuid.uuid4().hex[:5]}"),
        )["id"]
    )


def cells(c: db.Conn, class_id: Any, on) -> list[tuple]:
    """The pattern on a date as comparable tuples: (period label, week, weekday, cell, subject, text), empty cells left out."""
    got = tt_pattern.read(c, class_id, on)
    label = {p["id"]: p["label"] for p in got["periods"]}
    return sorted(
        (label[x["period_id"]], x["week"], x["weekday"], x["cell"], x["subject_code"], x["text"])
        for x in got["cells"]
        if x["cell"] != "empty"
    )


def edit(w: dict, period: str, week: str, weekday: int, **what) -> dict:
    return {"period_id": str(w["period"][period]), "week": week, "weekday": weekday, **what}


def lessons_signature(c: db.Conn, class_id: Any) -> list[tuple]:
    """Every lesson of the class as it stands (each row, whole), to show a pattern change touched none."""
    rows = c.execute("select * from session where school_class_id = %s order by id", (class_id,)).fetchall()
    return [tuple(sorted((k, str(v)) for k, v in r.items())) for r in rows]


def coordinator(w: dict):
    return w["staff"]["coordinator"]["id"]
