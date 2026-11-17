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
from engine.w2_print import k2_day, tt_clash, tt_day, tt_delayed, tt_edit, tt_heads, tt_live, tt_move, tt_need
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


class DelayedMove(BaseModel):
    session_id: str
    to_date: dt.date
    to_period: int


class Delayed(BaseModel):
    actor: str
    grade: str
    section: str
    year: str
    moves: list[DelayedMove]
    reason: str | None = None


class DayMark(BaseModel):
    actor: str
    grade: str
    section: str
    year: str
    date: dt.date
    kind: str  # holiday | event | teaching
    note: str | None = None


class ClassRef(BaseModel):
    actor: str
    grade: str
    section: str
    year: str


class LessonEdit(BaseModel):
    actor: str
    session_id: str
    text: str | None = None
    subject_code: str | None = None
    activity_code: str | None = None  # CP-39: the activity the lesson holds; empty clears it
    reason: str | None = None


class LessonOffers(BaseModel):
    actor: str
    session_id: str


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


@keyed.post("/timetable/delayed")
def move_delayed(body: Delayed, conn=Depends(get_conn, scope="function")):
    """CP-59: delayed lessons moved to free places of a coming week in one save. Any refusal: 409, nothing written."""
    staff = _staff(conn, body.actor)
    if not gate.sees_all(conn, staff):
        # an educator moves her own class's lessons (Nimish, 16 Nov 2026: "teachers"), with the timetable switched on for her: never another
        # class's, and never while she only previews it
        if not gate.switched_on(conn):
            raise HTTPException(status_code=403, detail="The timetable is not switched on.")
        try:
            klass = tt_move._class(conn, body.grade, body.section, body.year)  # noqa: SLF001
        except tt_move.Refused as no:
            raise HTTPException(status_code=409, detail=str(no)) from no
        if str(klass["id"]) not in {c["id"] for c in k2_day.my_classes(conn, staff, gate.school_today(conn))}:
            raise HTTPException(status_code=403, detail="That is not a class you hold.")
    try:
        return tt_delayed.move_delayed(
            conn, body.grade, body.section, body.year, [(m.session_id, m.to_date, m.to_period) for m in body.moves],
            who=staff, reason=body.reason,
        )  # fmt: skip
    except (tt_move.Refused, fc.CycleError) as no:
        raise HTTPException(status_code=409, detail=str(no)) from no


@keyed.post("/timetable/day/mark")
def day_mark(body: DayMark, conn=Depends(get_conn, scope="function")):
    """CP-65: a day marked a holiday, an event day, or a teaching day again; says how many lessons then need a new slot. Staff planning
    screen, as the moves are: 409 with nothing written on a refusal."""
    staff = _staff(conn, body.actor)
    try:
        k = tt_move._class(conn, body.grade, body.section, body.year)  # noqa: SLF001
        return tt_day.mark_day(conn, k["campus_id"], body.date, body.kind, body.note, today=gate.school_today(conn), who=staff)
    except (tt_move.Refused, fc.CycleError) as no:
        raise HTTPException(status_code=409, detail=str(no)) from no


@keyed.post("/timetable/day/needs-slot")
def day_needs_slot(body: ClassRef, conn=Depends(get_conn, scope="function")):
    """CP-65: the class's planned lessons on holiday or event days, in date order."""
    _staff(conn, body.actor)
    try:
        return tt_day.needing_a_slot(conn, body.grade, body.section, body.year)
    except tt_move.Refused as no:
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
            activity_code=body.activity_code,
        )
    except (tt_edit.Refused, fc.CycleError) as no:
        status = 403 if "not in it" in str(no) else 409
        raise HTTPException(status_code=status, detail=str(no)) from no


@keyed.post("/timetable/lesson/offers")
def lesson_offers(body: LessonOffers, conn=Depends(get_conn, scope="function")):
    """CP-39: the activities a lesson may hold (those of its head), for the coordinator to choose from. Not in the go-live
    group: 403; any other refusal: 409. Reads only."""
    staff = _staff(conn, body.actor)
    try:
        return tt_heads.offers(conn, body.session_id, who=staff)
    except (tt_heads.Refused, fc.CycleError) as no:
        raise HTTPException(status_code=403 if "not in it" in str(no) else 409, detail=str(no)) from no


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
