"""The Build page's two other doors (CP-71, design F3): `/timetable/build/home` (what each class's card needs; any sign-in on the staff list)
and `/timetable/publish` (a class's pattern written as a fortnight's lessons; the coordinators only, `dry` to see first). Only wiring: the
work is `tt_build_home`'s and `tt_publish`'s."""

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from engine.api.deps import get_conn, require_engine_key
from engine.w2_print import tt_build_home, tt_pattern, tt_publish
from engine.w3_read import voice_intake, voice_store

keyed = APIRouter(dependencies=[Depends(require_engine_key)])


class Home(BaseModel):
    actor: str


class Publish(Home):
    class_id: str
    fortnight: int
    dry: bool = False
    reason: str | None = None


def _run(conn, actor: str, work):
    try:
        staff = voice_intake.staff_of(conn, actor)
    except voice_store.Refused as no:
        raise HTTPException(status_code=no.status, detail=str(no)) from no
    today = voice_intake.school_day(conn, dt.datetime.now(dt.UTC))
    try:
        return work(staff, today)
    except tt_pattern.Refused as no:
        raise HTTPException(status_code=no.status, detail=str(no)) from no


@keyed.post("/timetable/build/home")
def home(body: Home, conn=Depends(get_conn, scope="function")):
    return _run(conn, body.actor, lambda staff, today: tt_build_home.home(conn, today))


@keyed.post("/timetable/publish")
def publish(body: Publish, conn=Depends(get_conn, scope="function")):
    return _run(
        conn, body.actor,
        lambda staff, today: tt_publish.publish(conn, staff, body.class_id, body.fortnight, today=today, dry=body.dry, reason=body.reason),
    )  # fmt: skip
