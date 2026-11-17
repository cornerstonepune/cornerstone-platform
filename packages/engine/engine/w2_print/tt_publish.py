"""CP-71: publish a class's pattern as a fortnight's lessons (specs/CP-71/spec.md Done when 8; design F4).

The pattern is dateless rules; the lessons are `session` rows, one per non-empty cell per school day of the fortnight, none on a holiday. Each
day is read from the pattern as it stood on that day, so a pattern change dated inside the fortnight lands on the right days. Refused, with
its sentence and nothing written, while a Must problem touching the class is open and not allowed (a Try to never stops it), while the
fortnight already has lessons for the class (a published fortnight changes by move, edit or holiday, the tools that already exist), or while a
school day of the fortnight is missing from the calendar. `dry` works everything out and writes nothing. Only the coordinators publish.
Code decides; no model, no name."""

import datetime as dt
from typing import Any

from engine.core import db, history
from engine.w2_print import fortnight_cycle as fc
from engine.w2_print import tt_check, tt_check_load, tt_pattern
from engine.w2_print.tt_rules import Refused


def _fortnight(conn: db.Conn, k: dict, number: int) -> dict:
    found = conn.execute(
        "select id::text as id, number, kind, starts_on, ends_on from fortnight where academic_year_id = %s and number = %s",
        (k["academic_year_id"], number),
    ).fetchone()
    if found is None or found["kind"] != "teaching":
        raise Refused(f"There is no teaching fortnight {number} in this class's year.", 404)
    return found


def blockers(conn: db.Conn, class_id: str, on: dt.date) -> list[dict]:
    """The Must problems nobody allowed that touch this class, whoever else they touch (an educator clash is two classes')."""
    ids = list(dict.fromkeys([class_id, *tt_check_load.classes_with_pattern(conn)]))
    w = tt_check_load.world(conn, ids, on)
    return [
        p for p in tt_check.blocking(tt_check.check(w)) if any(x["class_id"] == class_id for x in p["places"])
    ]


def _lessons(conn: db.Conn, k: dict, days: list[tuple[dt.date, Any]], first: dt.date) -> list[tuple]:
    out = []
    for on, day_id in days:
        week = "A" if (on - first).days < 7 else "B"
        for (period, wk, wd), r in sorted(tt_pattern._open(conn, k["id"], on).items()):
            if wk == week and wd == on.isoweekday() and r["cell"] != "empty":
                out.append((day_id, period, r["cell"], r["subject_code"], r["text"]))
    return out


def publish(
    conn: db.Conn,
    staff: Any,
    class_id: Any,
    number: int,
    *,
    today: dt.date,
    dry: bool = False,
    reason: str | None = None,
) -> dict:
    """Write the lessons of fortnight `number` for the class from its pattern; returns how many, and the holidays left bare."""
    with conn.transaction():
        k = tt_pattern._class(conn, class_id)
        tt_pattern.guard(conn, staff, k["tenant_id"], today)
        conn.execute(
            "select pg_advisory_xact_lock(hashtext(%s), hashtext(%s))", (str(k["tenant_id"]), k["id"])
        )
        f = _fortnight(conn, k, number)
        stop = blockers(conn, k["id"], f["starts_on"])
        if stop:
            more = f" ({len(stop) - 1} more)" if len(stop) > 1 else ""
            raise Refused(
                f"Not published: {stop[0]['sentence']}{more} Fix it, or allow it with a reason.", 409
            )
        held = db.one(
            conn,
            "select count(*) as n from session s join school_day d on d.id = s.school_day_id where s.school_class_id = %s"
            " and d.on_date between %s and %s",
            (k["id"], f["starts_on"], f["ends_on"]),
        )["n"]
        if held:
            raise Refused(
                f"{k['grade']} {k['section']} already has {held} lessons in fortnight {number}; a published fortnight changes by moving or editing a lesson.",
                409,
            )
        campus = db.one(conn, "select campus_id from school_class where id = %s", (k["id"],))["campus_id"]
        known = {
            r["on_date"]: r
            for r in conn.execute(
                "select id, on_date, kind from school_day where campus_id = %s and on_date between %s and %s",
                (campus, f["starts_on"], f["ends_on"]),
            ).fetchall()
        }
        weekdays = [
            f["starts_on"] + dt.timedelta(n)
            for n in range(14)
            if (f["starts_on"] + dt.timedelta(n)).isoweekday() <= 5
        ]
        missing = [d.isoformat() for d in weekdays if d not in known]
        if missing:
            raise Refused(
                "These school days are not on the calendar yet; add them first: " + ", ".join(missing), 409
            )
        holidays = [d for d in weekdays if known[d]["kind"] == "holiday"]
        rows = _lessons(conn, k, [(d, known[d]["id"]) for d in weekdays if d not in holidays], f["starts_on"])
        if not dry:
            fc.ensure_editable(
                conn, [f["id"]], reason=reason, table="session", record_id=k["id"], op="insert", actor=staff
            )
            history.by(conn, f"staff:{staff}")
            with conn.cursor() as cur:
                cur.executemany(
                    "insert into session (tenant_id, school_class_id, school_day_id, period_id, kind, subject_code, text)"
                    " values (%s, %s, %s, %s, %s, %s, %s)",
                    [
                        (k["tenant_id"], k["id"], day, period, kind, subject, text)
                        for day, period, kind, subject, text in rows
                    ],
                )
    return {
        "class_id": k["id"], "fortnight": number, "starts_on": f["starts_on"].isoformat(), "dry": dry, "written": len(rows),
        "holidays": [d.isoformat() for d in holidays],
    }  # fmt: skip
