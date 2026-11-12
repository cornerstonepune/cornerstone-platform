"""Attendance (CP-42): the school's report loaded, and a child's or a class's days read. Wiring only: the rules are
`core/attendance.py`'s. A name in the report is matched inside the engine and never kept, logged or answered."""

import datetime as dt
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from engine.api.deps import get_conn, require_engine_key
from engine.core import attendance
from engine.w2_print import educator_gate
from engine.w3_read import k2_picture_reads, voice_intake, voice_store

keyed = APIRouter(dependencies=[Depends(require_engine_key)])


class Load(BaseModel):
    actor: str
    rows: list[dict[str, Any]]  # name, date, program, total_hours, hours, in, out, absent, leave


class ChildAsk(BaseModel):
    actor: str
    class_id: str
    roll_no: str
    start: dt.date
    end: dt.date


class ClassAsk(BaseModel):
    actor: str
    class_id: str
    start: dt.date
    end: dt.date
    by: Literal["week", "month"] = "week"


def _fail(no: voice_store.Refused) -> HTTPException:
    return HTTPException(status_code=getattr(no, "status", 403), detail=str(no))


def _range(a: dt.date, b: dt.date) -> None:
    if b < a or (b - a).days > 400:
        raise HTTPException(status_code=422, detail="Give a start and an end, at most 400 days apart.")


@keyed.post("/attendance/load")
def load(body: Load, conn=Depends(get_conn, scope="function")):
    """Coordinators only. The same report twice leaves the same rows; rows not loaded come back by number and program."""
    try:
        staff = voice_intake.staff_of(conn, body.actor)
    except voice_store.Refused as no:
        raise _fail(no) from no
    if not educator_gate.sees_all(conn, staff):
        raise HTTPException(status_code=403, detail="Attendance is loaded by the coordinators.")
    return attendance.load(conn, body.rows)


@keyed.post("/attendance/child")
def child(body: ChildAsk, conn=Depends(get_conn, scope="function")):
    _range(body.start, body.end)
    try:
        where = k2_picture_reads._allowed(conn, body.actor, body.class_id)
        here = conn.execute(
            "select child_id from enrolment where class_id = %s and roll_no = %s and from_date <= %s"
            " and (to_date is null or to_date >= %s)",
            (where["class"], body.roll_no, body.end, body.end),
        ).fetchone()
        if here is None:
            raise voice_store.Refused("There is no such Sr. No. in this class.", 404)
    except voice_store.Refused as no:
        raise _fail(no) from no
    return attendance.child(conn, str(here["child_id"]), body.start, body.end)


@keyed.post("/attendance/class")
def klass(body: ClassAsk, conn=Depends(get_conn, scope="function")):
    _range(body.start, body.end)
    try:
        where = k2_picture_reads._allowed(conn, body.actor, body.class_id)
    except voice_store.Refused as no:
        raise _fail(no) from no
    return attendance.klass(conn, where["class"], body.start, body.end, body.by)
