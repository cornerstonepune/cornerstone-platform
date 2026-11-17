"""CP-65: a school day marked a holiday or an event day, and the lessons that then need a new slot.

A holiday or an event day is one `school_day` row of kind `holiday` (nothing is taught); the note says which: an event day's note
starts `Event: `. The lessons the day held stay where they are, still planned, and are the ones `needing_a_slot` lists; each is placed
by `tt_delayed.move_delayed` (which runs the move checks: free place, fixed period, materials already sent, clashes of a settled
fortnight) or by the solver. Marking a day never deletes a lesson. A day gone by is not marked: what was taught is a record."""

import datetime as dt
from typing import Any

from engine.core import db
from engine.w2_print import fortnight_cycle as fc
from engine.w2_print import tt_move
from engine.w2_print.tt_clash import Refused

KINDS = ("holiday", "event", "teaching")
EVENT = "Event: "


def mark_day(
    conn: db.Conn, campus_id: Any, on: dt.date, kind: str, note: str | None, *, today: dt.date, who: Any
) -> dict:  # fmt: skip
    """Mark `on` a holiday, an event day, or a teaching day again. Returns how many lessons now need a new slot."""
    if kind not in KINDS:
        raise Refused(f"{kind} is not a kind of day: holiday, event or teaching.")
    if on < today:
        raise Refused(f"{on} has gone by; a day already taught is not re-marked.")
    day = conn.execute(
        "select id, tenant_id from school_day where campus_id = %s and on_date = %s", (campus_id, on)
    ).fetchone()
    if day is None:
        raise Refused(f"{on} has no school day on record; add it to the calendar first.")
    said = (note or "").strip()
    stored = "teaching" if kind == "teaching" else "holiday"
    words = (EVENT + said if kind == "event" else said) or None
    with conn.transaction():
        f = conn.execute(
            "select id from fortnight where tenant_id = %s and %s between starts_on and ends_on",
            (day["tenant_id"], on),
        ).fetchone()
        if f is not None:
            fc.ensure_editable(
                conn,
                [f["id"]],
                reason=words or kind,
                table="school_day",
                record_id=str(day["id"]),
                op="update",
                actor=who,
            )
        conn.execute(
            "update school_day set kind = %s, note = %s, updated_at = now() where id = %s",
            (stored, words, day["id"]),
        )
    row = conn.execute(
        "select count(*) as n from session where school_day_id = %s and state = 'planned' and kind <> 'fixed'",
        (day["id"],),
    ).fetchone()
    n = row["n"] if row else 0
    return {"date": on, "kind": kind, "needs_a_slot": n if stored == "holiday" else 0}


def needing_a_slot(conn: db.Conn, grade: str, section: str, year: str) -> list[dict]:
    """This class's planned lessons that sit on a holiday or event day, in date order."""
    k = tt_move._class(conn, grade, section, year)  # noqa: SLF001
    return conn.execute(
        "select s.id::text as session_id, d.on_date, d.note, p.ord, p.label, s.subject_code, s.text"
        " from session s join school_day d on d.id = s.school_day_id join period p on p.id = s.period_id"
        " where s.school_class_id = %s and d.kind = 'holiday' and s.state = 'planned' and s.kind <> 'fixed'"
        " order by d.on_date, p.ord",
        (k["id"],),
    ).fetchall()
