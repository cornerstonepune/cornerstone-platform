"""The educator's timetable (M1-06 part 2): her day, her week, one period. Only wiring: what is read is
`k2_day`'s. From the site with the engine's key and her email as `actor`, as the voice routes are; every call refuses
while `educator.timetable_enabled` is off unless she is the staff preview (`w2_print/educator_gate.py`), and answers
only for a class she holds. The school's coordinators (`educator_gate.sees_all`) read any class they name, switched on or off."""

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from engine.api.deps import get_conn, require_engine_key
from engine.w2_print import educator_gate, k2_day, tt_time
from engine.w3_read import voice_intake, voice_store

keyed = APIRouter(dependencies=[Depends(require_engine_key)])


class Ask(BaseModel):
    actor: str
    class_id: str | None = None
    day: dt.date | None = None
    week_of: dt.date | None = None
    period_id: str | None = None


def _today(conn) -> dt.date:
    """Today by the school's clock, never the server's."""
    return voice_intake.school_day(conn, dt.datetime.now(dt.UTC))


def _refused(no: Exception) -> HTTPException:
    return HTTPException(status_code=getattr(no, "status", 403), detail=str(no))


def _gate(conn, body: Ask, reads: bool = False):
    """Her staff id, once the gate lets her past: switched on, or she is the staff preview (D-076). First, before any
    field is checked, so a call while switched off learns nothing more. `reads` (off unless a route says so): a call that reads a
    timetable (a day, a week, a period), which the school's coordinators may make whether the switch is on or off (issue #691); the question
    "are her screens open" (`/timetable/open`) is not one, so the activity and curriculum pages stay as they were."""
    try:
        staff = voice_intake.staff_of(conn, body.actor)
    except voice_store.Refused as no:
        if not educator_gate.switched_on(conn):
            raise HTTPException(status_code=403, detail="The timetable is not switched on.") from no
        raise _refused(no) from no
    if not (educator_gate.open_to(conn, staff) or (reads and educator_gate.sees_all(conn, staff))):
        raise HTTPException(status_code=403, detail="The timetable is not switched on.")
    return staff


def _mine(conn, body: Ask, on: dt.date, staff=None) -> tuple[dict, list[dict]]:
    """Her class and every class she holds on that day (`staff` when the gate has run already)."""
    staff = staff or _gate(conn, body, reads=True)
    try:
        classes = k2_day.my_classes(conn, staff, on)
        # a coordinator naming a class not in the list (none held, or no lesson that day) is given it: read-only, as above
        if (
            body.class_id
            and all(c["id"] != body.class_id for c in classes)
            and educator_gate.sees_all(conn, staff)
        ):
            one = educator_gate.a_class(conn, staff, body.class_id)
            classes = classes + [one] if one else classes
        return k2_day.chosen(classes, body.class_id), classes
    except k2_day.Refused as no:
        raise _refused(no) from no


@keyed.post("/timetable/open")
def open_to(body: Ask, conn=Depends(get_conn, scope="function")):
    """Whether her screens are open to her, for a screen that reads no timetable (the activity page): refused as every
    other call is, else whether she sees them as the staff preview."""
    return {"previewing": educator_gate.previewing(conn, _gate(conn, body))}


@keyed.post("/timetable/day")
def day(body: Ask, conn=Depends(get_conn, scope="function")):
    on = body.day or _today(conn)
    klass, classes = _mine(conn, body, on)
    return k2_day.day(conn, klass, classes, on)


@keyed.post("/timetable/week")
def week(body: Ask, conn=Depends(get_conn, scope="function")):
    on = body.week_of or body.day or _today(conn)
    # her class is the one she holds by the week's last teaching day, so a grant that starts mid-week still shows the week
    klass, classes = _mine(conn, body, on - dt.timedelta(days=on.weekday()) + dt.timedelta(days=4))
    return k2_day.week(conn, klass, classes, on)


@keyed.post("/timetable/period")
def period(body: Ask, conn=Depends(get_conn, scope="function")):
    staff = _gate(conn, body, reads=True)
    if not (body.day and body.period_id):
        raise HTTPException(status_code=422, detail="Name the day and the period.")
    klass, classes = _mine(conn, body, body.day, staff)
    try:
        return k2_day.period(conn, klass, classes, body.day, body.period_id)
    except k2_day.Refused as no:
        raise _refused(no) from no


@keyed.post("/timetable/activity")
def activity(body: Ask, conn=Depends(get_conn, scope="function")):
    """CP-39: the activity of one lesson in full (its steps, objectives, skills, materials and rubric levels), asked when a
    teacher opens the lesson; the day, week and period calls carry only who it is."""
    staff = _gate(conn, body)
    if not (body.day and body.period_id):
        raise HTTPException(status_code=422, detail="Name the day and the period.")
    klass, _ = _mine(conn, body, body.day, staff)
    try:
        return k2_day.period_activity(conn, klass, body.day, body.period_id)
    except k2_day.Refused as no:
        raise _refused(no) from no


class TimeAsk(BaseModel):
    actor: str
    start: dt.date
    end: dt.date
    class_id: str | None = None  # one class she holds, or any class for a coordinator
    grade: str | None = None  # every class of the grade (K2): coordinators only


@keyed.post("/timetable/time")
def time_by_subject(body: TimeAsk, conn=Depends(get_conn, scope="function")):
    """CP-41: a class's (or a whole grade's) lesson minutes by subject over a range, and a week at a time, beside the
    standing timetable's (page charter B3, Time by subject). `read` names the classes counted; `may_read` the classes she
    may ask for in these days (a coordinator: every class with lessons; anyone else: the classes she holds), so the page
    offers no class the engine would refuse."""
    staff = _gate(conn, Ask(actor=body.actor), reads=True)
    if body.end < body.start or (body.end - body.start).days > 400:
        raise HTTPException(status_code=422, detail="Give a start and an end, at most 400 days apart.")
    if bool(body.class_id) == bool(body.grade):
        raise HTTPException(status_code=422, detail="Name a class or a grade, not both and not neither.")
    if body.grade:
        if not educator_gate.sees_all(conn, staff):
            raise HTTPException(status_code=403, detail="A whole grade is read by the coordinators.")
        ids = tt_time.class_ids_of(conn, body.grade, body.start, body.end)
    else:
        klass, _ = _mine(conn, Ask(actor=body.actor, class_id=body.class_id), body.start, staff)
        ids = [klass["id"]]
    every = (
        tt_time.classes_with_lessons(conn, None, body.start, body.end)
        if educator_gate.sees_all(conn, staff)
        else k2_day.my_classes(conn, staff, body.end)
    )
    out = tt_time.time_by_subject(conn, ids, body.start, body.end)
    return out | {"read": _said(tt_time.classes_named(conn, ids)), "may_read": _said(every)}


def _said(classes: list[dict]) -> list[dict]:
    return [{"id": str(c["id"]), "grade": c["grade"], "section": c["section"]} for c in classes]
