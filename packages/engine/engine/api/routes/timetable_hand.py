"""The timetable by hand (CP-12): move or swap a lesson, accept a clash. Only wiring: the checks and the writing are
`tt_move`'s and `tt_clash`'s, the same the commands call (docs/backend-plan.md: a keyed route beside each command).
From the site with the engine's key and the person's email as `actor`; a sign-in not on the staff list is refused (403)
and nothing is written. These are the staff's planning screens, so the educator switch does not gate them."""

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from engine.api.deps import get_conn, require_engine_key
from engine.w2_print import educator_gate as gate
from engine.w2_print import fortnight_cycle as fc
from engine.w2_print import tt_clash, tt_move
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


class Accept(BaseModel):
    actor: str
    key: str
    reason: str


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


@keyed.post("/timetable/clash/accept")
def accept(body: Accept, conn=Depends(get_conn, scope="function")):
    staff = _staff(conn, body.actor)
    try:
        return tt_clash.accept(conn, body.key, who=staff, reason=body.reason, today=gate.school_today(conn))
    except tt_clash.Refused as no:
        raise HTTPException(status_code=409, detail=str(no)) from no
