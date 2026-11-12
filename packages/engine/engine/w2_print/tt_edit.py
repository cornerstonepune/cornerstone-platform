"""CP-35: one lesson's topic and subject changed by hand (specs/CP-35/spec.md).

A lesson is one dated `session`. The edit changes its topic text and/or its subject and nothing else, so the lesson keeps
its id, plan line, state and materials links (moves stay in `tt_move`). Only the go-live group (`tt_live.GROUP`) may
edit; a day already past, a holiday, a fixed or marked lesson, a subject the class is not taught and an edit that
changes nothing are refused, naming the reason and writing nothing. CP-6's freeze (`fortnight_cycle.ensure_editable`)
asks for a reason past planning. Each edit writes one `change_log` row (`session`, op `edit`, the old and new words).
Code decides everything; no model, no name."""

from typing import Any

from engine.core import db
from engine.w2_print import educator_gate as gate
from engine.w2_print import fortnight_cycle as fc
from engine.w2_print import tt_live
from engine.w2_print.tt_live_plan import Refused


def _lesson(conn: db.Conn, session_id: str) -> dict:
    try:
        s = conn.execute(
            "select s.*, d.on_date, d.kind as day_kind, p.fixed as period_fixed, c.academic_year_id"
            " from session s join school_day d on d.id = s.school_day_id join period p on p.id = s.period_id"
            " join school_class c on c.id = s.school_class_id where s.id = %s",
            (session_id,),
        ).fetchone()
    except Exception:  # not an id at all: the same answer as an id nothing holds
        conn.rollback()
        s = None
    if s is None:
        raise Refused("there is no lesson with that id.")
    return s


def _taught(conn: db.Conn, s: dict, code: str) -> bool:
    """Whether the class has periods for the subject in its standing frame (the same rows the rules page lists)."""
    return (
        conn.execute(
            "select 1 from timetable_rule where school_class_id = %s and kind = 'frame' and valid_to is null"
            " and cell in ('subject', 'specialist') and subject_code = %s limit 1",
            (s["school_class_id"], code),
        ).fetchone()
        is not None
    )


def edit(
    conn: db.Conn, session_id: str, *, who: Any, text: str | None = None, subject_code: str | None = None,
    reason: str | None = None,
) -> dict:  # fmt: skip
    """Change the lesson's topic text and/or subject, as `who` (a staff id). Raises `Refused` (nothing written) when a
    check fails, `fortnight_cycle.CycleError` when the fortnight is past planning and no reason is given."""
    s = _lesson(conn, str(session_id))
    today = gate.school_today(conn)
    tt_live.in_group(conn, str(s["tenant_id"]), who, today, what="edit a lesson")
    if text is None and subject_code is None:
        raise Refused("Give the new words, the new subject, or both.")
    new_text = s["text"] if text is None else text.strip()
    if text is not None and not new_text:
        raise Refused("A lesson needs words: give its topic, not blanks.")
    new_subject = s["subject_code"] if subject_code is None else subject_code
    if s["day_kind"] == "holiday":
        raise Refused(f"{s['on_date']} is a holiday; nothing is taught there.")
    if s["on_date"] < today:
        raise Refused(f"{s['on_date']} is already past; a lesson on a day gone by is not edited.")
    if s["kind"] == "fixed" or s["period_fixed"]:
        raise Refused(f"{s['text'] or 'this'} is a fixed lesson; it is not edited.")
    if s["state"] != "planned" or not s["planned"]:
        raise Refused(
            f"the lesson on {s['on_date']} is already marked {s['state'].replace('_', ' ')}; only a planned lesson is edited."
        )
    if subject_code is not None and subject_code != s["subject_code"] and not _taught(conn, s, subject_code):
        raise Refused(f"'{subject_code}' is not taught to this class; choose one of its subjects.")
    if (new_text, new_subject) == (s["text"], s["subject_code"]):
        raise Refused("That is what the lesson already says; nothing changes.")
    f = conn.execute(
        "select id from fortnight where academic_year_id = %s and kind = 'teaching' and %s between starts_on and ends_on",
        (s["academic_year_id"], s["on_date"]),
    ).fetchone()
    with conn.transaction():
        if f is not None:
            fc.ensure_editable(
                conn,
                [f["id"]],
                reason=reason,
                table="session",
                record_id=str(s["id"]),
                op="update",
                actor=who,
            )
        conn.execute(
            "update session set text = %s, subject_code = %s, updated_at = now() where id = %s",
            (new_text, new_subject, s["id"]),
        )
        conn.execute(
            "insert into change_log (tenant_id, table_name, row_id, op, before, after, staff_id, origin, reason)"
            " values (%s, 'session', %s, 'edit', jsonb_build_object('text', %s::text, 'subject_code', %s::text),"
            " jsonb_build_object('text', %s::text, 'subject_code', %s::text), %s, %s, %s)",
            (s["tenant_id"], str(s["id"]), s["text"], s["subject_code"], new_text, new_subject, who, f"staff:{who}",
             (reason or "").strip() or None),
        )  # fmt: skip
    return {
        "session_id": str(s["id"]),
        "on_date": s["on_date"].isoformat(),
        "text": new_text,
        "subject_code": new_subject,
    }
