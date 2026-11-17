"""CP-35: one lesson's topic and subject changed by hand (specs/CP-35/spec.md); CP-74: and what it teaches (its objective).

A lesson is one dated `session`. The edit changes its topic text and/or its subject and nothing else, so the lesson keeps
its id, plan line, state and materials links (moves stay in `tt_move`). Only the go-live group (`tt_live.GROUP`) may
edit; a day already past, a holiday, a fixed or marked lesson, a subject the class is not taught and an edit that
changes nothing are refused, naming the reason and writing nothing. CP-6's freeze (`fortnight_cycle.ensure_editable`)
asks for a reason past planning. Each edit writes one `change_log` row (`session`, op `edit`, the old and new words).
CP-74 (specs/CP-74/spec.md): the lesson's objective (`lo_code`) is chosen here too, and a choice of objective or activity marks the
lesson `person`, so the suggestion job never overwrites it. The coordinators may change anything; an educator who holds the class (and the
subject, when her grant names one) may choose what her own lesson teaches, nothing else. Code decides everything; no model, no name."""

from typing import Any

from psycopg.types.json import Jsonb

from engine.core import db
from engine.w2_print import educator_gate as gate
from engine.w2_print import fortnight_cycle as fc
from engine.w2_print import tt_heads, tt_live
from engine.w2_print.tt_live_plan import Refused


def lesson(conn: db.Conn, session_id: str) -> dict:
    try:
        s = conn.execute(
            "select s.*, d.on_date, d.kind as day_kind, p.fixed as period_fixed, c.academic_year_id, c.grade_code"
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


def _ensure_open(s: dict, today: Any, *, words: bool) -> None:
    """The lesson may be edited at all: a school day not past, not a holiday, still planned, and, when its words or subject
    are to change, not a fixed lesson (its activity may be chosen: `tt_heads` says whether its head takes one)."""
    if s["day_kind"] == "holiday":
        raise Refused(f"{s['on_date']} is a holiday; nothing is taught there.")
    if s["on_date"] < today:
        raise Refused(f"{s['on_date']} is already past; a lesson on a day gone by is not edited.")
    if (s["kind"] == "fixed" or s["period_fixed"]) and words:
        raise Refused(f"{s['text'] or 'this'} is a fixed lesson; its words and subject are not edited.")
    if s["state"] != "planned" or not s["planned"]:
        raise Refused(
            f"the lesson on {s['on_date']} is already marked {s['state'].replace('_', ' ')}; only a planned lesson is edited."
        )


def may(
    conn: db.Conn, s: dict, who: Any, today: Any, *, choice_only: bool, what: str = "edit a lesson"
) -> None:
    """Refuse unless `who` is in the go-live group, or, for a choice of objective or activity alone, holds the lesson's class
    today (`educator_gate.held`) in a grant for the whole class or for the lesson's subject."""
    try:
        tt_live.in_group(conn, str(s["tenant_id"]), who, today, what=what)
    except Refused:
        if not choice_only:
            raise
        mine = next((k for k in gate.held(conn, who, today) if k["id"] == str(s["school_class_id"])), None)
        if mine is None or (
            mine["subjects"] is not None and not set(mine["subjects"]) & set(tt_heads.subjects_of(conn, s))
        ):
            raise


def _objective(conn: db.Conn, s: dict, lo_code: str) -> None:
    """Refuse unless `lo_code` is a live objective of the lesson's grade in the lesson's subject."""
    o = conn.execute(
        "select title, subject_code, retired, (band = %s or %s = any(also_bands)) as here from learning_objective"
        " where tenant_id = %s and code = %s",
        (s["grade_code"], s["grade_code"], s["tenant_id"], lo_code),
    ).fetchone()
    if o is None or not o["here"]:
        raise Refused(f"there is no objective '{lo_code}' for this grade.")
    if o["retired"]:
        raise Refused(f"'{o['title']}' is retired; choose an objective that is still taught.")
    if o["subject_code"] not in tt_heads.subjects_of(conn, s):
        raise Refused(f"'{o['title']}' is not an objective of this lesson's subject.")


def _wanted(
    conn: db.Conn,
    s: dict,
    text: str | None,
    subject_code: str | None,
    activity_code: str | None,
    lo_code: str | None,
) -> dict:
    """What the lesson would say after the edit, each new value checked; `Refused` names the first that fails."""
    new = {
        "text": s["text"] if text is None else text.strip(),
        "subject_code": s["subject_code"] if subject_code is None else subject_code,
        "activity_code": s["activity_code"] if activity_code is None else (activity_code.strip() or None),
        "lo_code": s["lo_code"] if lo_code is None else (lo_code.strip() or None),
    }
    if text is not None and not new["text"]:
        raise Refused("A lesson needs words: give its topic, not blanks.")
    if subject_code is not None and subject_code != s["subject_code"] and not _taught(conn, s, subject_code):
        raise Refused(f"'{subject_code}' is not taught to this class; choose one of its subjects.")
    if new["lo_code"] and new["lo_code"] != s["lo_code"]:
        _objective(conn, s, new["lo_code"])
    if new["activity_code"] and new["activity_code"] != s["activity_code"]:
        tt_heads.ensure_offered(conn, s, new["activity_code"], new["lo_code"])
    if all(new[k] == s[k] for k in new):
        raise Refused("That is what the lesson already says; nothing changes.")
    return new


def edit(
    conn: db.Conn, session_id: str, *, who: Any, text: str | None = None, subject_code: str | None = None,
    reason: str | None = None, activity_code: str | None = None, lo_code: str | None = None,
) -> dict:  # fmt: skip
    """Change the lesson's topic text, subject, activity and/or objective, as `who` (a staff id). Raises `Refused` (nothing
    written) when a check fails, `fortnight_cycle.CycleError` when the fortnight is past planning and no reason is given."""
    s = lesson(conn, str(session_id))
    today = gate.school_today(conn)
    words = text is not None or subject_code is not None
    may(conn, s, who, today, choice_only=not words)
    if not words and activity_code is None and lo_code is None:
        raise Refused(
            "Give the new words, the new subject, the objective or the activity (empty clears it), or any of them."
        )
    _ensure_open(s, today, words=words)
    new = _wanted(conn, s, text, subject_code, activity_code, lo_code)
    chose = (new["activity_code"], new["lo_code"]) != (s["activity_code"], s["lo_code"])
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
            "update session set text = %s, subject_code = %s, activity_code = %s, lo_code = %s,"
            " source = case when %s then 'person' else source end, updated_at = now() where id = %s",
            (new["text"], new["subject_code"], new["activity_code"], new["lo_code"], chose, s["id"]),
        )
        conn.execute(
            "insert into change_log (tenant_id, table_name, row_id, op, before, after, staff_id, origin, reason)"
            " values (%s, 'session', %s, 'edit', %s, %s, %s, %s, %s)",
            (s["tenant_id"], str(s["id"]), Jsonb({k: s[k] for k in new}), Jsonb(new), who, f"staff:{who}",
             (reason or "").strip() or None),
        )  # fmt: skip
    return {"session_id": str(s["id"]), "on_date": s["on_date"].isoformat(), **new}
