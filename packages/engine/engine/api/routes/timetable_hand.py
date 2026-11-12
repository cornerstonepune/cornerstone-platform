"""The timetable by hand (CP-12): move or swap a lesson, accept a clash; and put a draft live (CP-29). Only wiring: the checks and the writing are
`tt_move`'s and `tt_clash`'s, the same the commands call (docs/backend-plan.md: a keyed route beside each command).
From the site with the engine's key and the person's email as `actor`; a sign-in not on the staff list is refused (403)
and nothing is written. These are the staff's planning screens, so the educator switch does not gate them."""

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from engine.api.deps import get_conn, require_engine_key
from engine.w2_print import educator_gate as gate
from engine.w2_print import fortnight_cycle as fc
from engine.w2_print import tt_clash, tt_edit, tt_live, tt_move, tt_need
from engine.w3_read import voice_intake, voice_store

keyed = APIRouter(dependencies=[Depends(require_engine_key)])


class Move(BaseModel):
    actor: str
    grade: str
    section: str
    year: str
    from_date: dt.date
    from_period: int
    to_date: dt.date
    to_period: int
    reason: str | None = None


class LessonEdit(BaseModel):
    actor: str
    session_id: str
    text: str | None = None
    subject_code: str | None = None
    reason: str | None = None


class Accept(BaseModel):
    actor: str
    key: str
    reason: str


class GoLive(BaseModel):
    actor: str
    grade: str
    section: str
    year: str
    fortnight: int
    run_id: str | None = None  # the draft; the newest placed one when left out
    reason: str | None = None
    discard_changes: bool = False
    dry: bool = False


def _staff(conn, email: str):
    try:
        return voice_intake.staff_of(conn, email)
    except voice_store.Refused as no:
        raise HTTPException(status_code=no.status, detail=str(no)) from no


@keyed.post("/timetable/move")
def move(body: Move, conn=Depends(get_conn, scope="function")):
    staff = _staff(conn, body.actor)
    try:
        return tt_move.move(
            conn, body.grade, body.section, body.year, body.from_date, body.from_period, body.to_date,
            body.to_period, who=staff, reason=body.reason,
        )  # fmt: skip
    except (tt_move.Refused, fc.CycleError) as no:
        raise HTTPException(status_code=409, detail=str(no)) from no


@keyed.post("/timetable/lesson/edit")
def lesson_edit(body: LessonEdit, conn=Depends(get_conn, scope="function")):
    """CP-35: one lesson's topic and subject. Not in the go-live group: 403; any other refusal: 409, nothing written."""
    staff = _staff(conn, body.actor)
    try:
        return tt_edit.edit(
            conn,
            body.session_id,
            who=staff,
            text=body.text,
            subject_code=body.subject_code,
            reason=body.reason,
        )
    except (tt_edit.Refused, fc.CycleError) as no:
        status = 403 if "not in it" in str(no) else 409
        raise HTTPException(status_code=status, detail=str(no)) from no


@keyed.post("/timetable/clash/accept")
def accept(body: Accept, conn=Depends(get_conn, scope="function")):
    staff = _staff(conn, body.actor)
    try:
        return tt_clash.accept(conn, body.key, who=staff, reason=body.reason, today=gate.school_today(conn))
    except tt_clash.Refused as no:
        raise HTTPException(status_code=409, detail=str(no)) from no


@keyed.post("/timetable/go-live")
def go_live(body: GoLive, conn=Depends(get_conn, scope="function")):
    """CP-22's go-live as a route: the same checks, then what changed. A refusal is a 409 and writes nothing."""
    staff = _staff(conn, body.actor)
    try:
        i = tt_need.load(conn, body.grade, body.section, body.year, body.fortnight)
        run = body.run_id or _newest_placed(conn, i)
        report = tt_live.go_live(
            conn, body.grade, body.section, body.year, body.fortnight, run_id=run, who=staff,
            reason=body.reason, discard=body.discard_changes, dry=body.dry,
        )  # fmt: skip
    except (tt_live.Refused, tt_need.NoSuchFortnight, fc.CycleError) as no:
        raise HTTPException(status_code=409, detail=str(no)) from no
    return report.changes()


def _newest_placed(conn, i) -> str:
    got = conn.execute(
        "select id from timetable_run where school_class_id = %s and fortnight_id = %s and outcome = 'placed'"
        " order by created_at desc, id desc limit 1",
        (i.class_id, i.fortnight_id),
    ).fetchone()
    if got is None:
        raise tt_live.Refused("no placed draft for this class and fortnight.")
    return str(got["id"])
