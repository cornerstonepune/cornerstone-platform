"""CP-69, My day: the lessons of one date for a person, across every class they hold. `k2_day.day` answers for one class;
this asks it for each class she holds on the date (a subject educator: the classes she holds for her subjects only) and, for a
coordinator who holds no class, for every class that has lessons that day (read-only, as `educator_gate.sees_all` says).
Reads only, with no child and no name. A lesson is a period that is neither a break nor an empty slot, and carries the id of its
session so the page can open its preparation (`/timetable/activity` names the lesson by day and period, in its own class)."""

import datetime as dt
from typing import Any

from engine.core import db
from engine.w2_print import educator_gate as gate
from engine.w2_print import k2_day

REFUSAL = "No class is yours on this day."


def _sessions(conn: db.Conn, class_id: str, on: dt.date) -> dict[str, str]:
    """The session of each period of a class on a date, by period."""
    return {
        r["period_id"]: r["id"]
        for r in conn.execute(
            "select s.id::text as id, s.period_id::text as period_id from session s"
            " join school_day d on d.id = s.school_day_id where s.school_class_id = %s and d.on_date = %s",
            (class_id, on),
        ).fetchall()
    }


def read(conn: db.Conn, staff: Any, on: dt.date) -> dict:
    """The date, what it is (teaching, holiday, none), whose lessons these are (`mine` or `school`) and the lessons in
    period order, ties by grade and section. Refused when no class is hers and she does not read the school's."""
    classes, scope = k2_day.my_classes(conn, staff, on), "mine"
    if not classes and gate.sees_all(conn, staff):
        classes, scope = gate.timetabled_classes(conn, on), "school"
    if not classes and scope == "mine":
        raise k2_day.Refused(REFUSAL)
    lessons: list[dict] = []
    day: dict = {
        "kind": "none",
        "note": None,
        "fortnight": None,
    }  # the school has no class with a lesson that date
    for klass in classes:
        got = k2_day.days(conn, klass, [on])[0]
        day = day if day["kind"] == "teaching" else got
        sessions = _sessions(conn, klass["id"], on)
        for p in got["periods"]:
            if p["kind"] in ("fixed", "empty") or p["period_id"] not in sessions:
                continue
            lessons.append({
                "session_id": sessions[p["period_id"]], "period_id": p["period_id"], "class": k2_day._public(klass),
                "starts_at": p["starts_at"], "ends_at": p["ends_at"], "subject": p["subject"], "name": p["name"],
                "state": p["state"], "activity": p["activity"],
            })  # fmt: skip
    lessons.sort(key=lambda x: (x["starts_at"] or "", x["class"]["grade"], x["class"]["section"] or ""))
    return {
        "day": on.isoformat(), "kind": day["kind"], "note": day["note"], "fortnight": day["fortnight"], "scope": scope,
        "lessons": lessons,
    }  # fmt: skip
