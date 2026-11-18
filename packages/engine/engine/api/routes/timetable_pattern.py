"""The timetable pattern a coordinator builds (CP-71, design F3): read it, change it, start a class from another, fill a period, copy a
week or a day. Only wiring: the checks and the writing are `tt_pattern`'s and `tt_pattern_copy`'s. From the site with the engine's key and the
person's email as `actor`; a sign-in not on the staff list is refused (403), and a write by anyone outside the coordinators' group is
refused (403) with nothing written. A change is dated `from_date` (default: the first fortnight not yet published)."""

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from engine.api.deps import get_conn, require_engine_key
from engine.w2_print import tt_build_home, tt_check_load, tt_pattern, tt_pattern_copy
from engine.w3_read import voice_intake, voice_store

keyed = APIRouter(dependencies=[Depends(require_engine_key)])


class Ask(BaseModel):
    actor: str
    class_id: str
    from_date: dt.date | None = None
    version: str | None = None  # the stamp `read` gave; a write made on an older one is refused (409)


class Place(BaseModel):
    week: str
    weekday: int


class Change(Ask):
    edits: list[dict]
    reason: str | None = None


class Copy(Ask):
    mode: str  # start_from | week | day
    from_class: str | None = None
    from_week: str = "A"
    to_week: str = "B"
    weekday: int | None = None
    to: list[Place] = []
    reason: str | None = None


class Fill(Ask):
    period_id: str
    cell: str
    subject_code: str | None = None
    text: str | None = None
    weeks: list[str] = ["A", "B"]
    reason: str | None = None


class Check(BaseModel):
    actor: str
    class_ids: list[str] = []  # none: every class that has a pattern
    from_date: dt.date | None = None


class Allow(Check):
    allow_key: str
    reason: str | None = None


def _who(conn, email: str):
    try:
        return voice_intake.staff_of(conn, email)
    except voice_store.Refused as no:
        raise HTTPException(status_code=no.status, detail=str(no)) from no


def _run(conn, body: Ask, work):
    staff = _who(conn, body.actor)
    today = voice_intake.school_day(conn, dt.datetime.now(dt.UTC))
    on = body.from_date or tt_pattern.next_unpublished(conn, body.class_id, today)
    try:
        return work(staff, on, today)
    except tt_pattern.Refused as no:
        raise HTTPException(status_code=no.status, detail=str(no)) from no


@keyed.post("/timetable/pattern/read")
def read(body: Ask, conn=Depends(get_conn, scope="function")):
    def work(staff, on, today):
        # with the pattern, the fortnight it would be published as: the first one of the class's year that has no lessons yet
        nxt = tt_build_home.next_fortnight(conn, body.class_id, today)
        return {**tt_pattern.read(conn, body.class_id, on), "next_fortnight": nxt}

    return _run(conn, body, work)


@keyed.post("/timetable/pattern/change")
def change(body: Change, conn=Depends(get_conn, scope="function")):
    return _run(
        conn,
        body,
        lambda staff, on, today: tt_pattern.change(
            conn, staff, body.class_id, body.edits, on, today=today, reason=body.reason, version=body.version
        ),
    )


@keyed.post("/timetable/pattern/copy")
def copy(body: Copy, conn=Depends(get_conn, scope="function")):
    def work(staff, on, today):
        if body.mode == "start_from" and body.from_class:
            return tt_pattern_copy.start_from(conn, staff, body.class_id, body.from_class, on, today=today)
        if body.mode == "week":
            return tt_pattern_copy.copy_week(
                conn,
                staff,
                body.class_id,
                body.from_week,
                body.to_week,
                on,
                today=today,
                reason=body.reason,
                version=body.version,
            )
        if body.mode == "day" and body.weekday:
            to = [(p.week, p.weekday) for p in body.to]
            return tt_pattern_copy.copy_day(
                conn,
                staff,
                body.class_id,
                body.from_week,
                body.weekday,
                to,
                on,
                today=today,
                reason=body.reason,
                version=body.version,
            )
        raise tt_pattern.Refused(
            "Say what to copy: start_from (with from_class), week, or day (with weekday and to)."
        )

    return _run(conn, body, work)


@keyed.post("/timetable/pattern/fill")
def fill(body: Fill, conn=Depends(get_conn, scope="function")):
    what = {"cell": body.cell, "subject_code": body.subject_code, "text": body.text}
    return _run(
        conn, body, lambda staff, on, today: tt_pattern_copy.fill_period(
            conn, staff, body.class_id, body.period_id, what, on, today=today, weeks=tuple(body.weeks), reason=body.reason, version=body.version)
    )  # fmt: skip


def _check_run(conn, body: Check, work):
    staff = _who(conn, body.actor)
    today = voice_intake.school_day(conn, dt.datetime.now(dt.UTC))
    ids = body.class_ids or tt_check_load.classes_with_pattern(conn)
    on = body.from_date or (tt_pattern.next_unpublished(conn, ids[0], today) if ids else today)
    try:
        return work(staff, ids, on, today)
    except tt_pattern.Refused as no:
        raise HTTPException(status_code=no.status, detail=str(no)) from no


@keyed.post("/timetable/pattern/check")
def check(body: Check, conn=Depends(get_conn, scope="function")):
    """Every problem of the patterns, in words, with the fixes proven to work; a sign-in on the staff list may read it."""
    return _check_run(conn, body, lambda staff, ids, on, today: tt_check_load.check(conn, ids, on))


@keyed.post("/timetable/pattern/allow")
def allow(body: Allow, conn=Depends(get_conn, scope="function")):
    return _check_run(
        conn,
        body,
        lambda staff, ids, on, today: tt_check_load.allow(
            conn, staff, ids, body.allow_key, body.reason, on, today=today
        ),
    )
