"""Fill it in for me (CP-75, design F3): `/timetable/solve` works out an answer and shows it, `/timetable/solve/use` is the coordinator
accepting it. Only wiring: the work is `tt_solve`'s. From the site with the engine's key and the person's email as `actor`; a sign-in not
on the staff list is refused (403), and so is anyone outside the coordinators' group, with nothing written."""

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from engine.api.deps import get_conn, require_engine_key
from engine.w2_print import tt_pattern, tt_solve
from engine.w3_read import voice_intake, voice_store

keyed = APIRouter(dependencies=[Depends(require_engine_key)])


class Solve(BaseModel):
    actor: str
    class_ids: list[str]
    from_date: dt.date | None = None
    seconds: int | None = None  # how long to look; never past the school's `timetable.solve_seconds`


class Use(BaseModel):
    actor: str
    run_ids: list[str]
    reason: str | None = None


def _run(conn, actor: str, work):
    try:
        staff = voice_intake.staff_of(conn, actor)
    except voice_store.Refused as no:
        raise HTTPException(status_code=no.status, detail=str(no)) from no
    try:
        return work(staff, voice_intake.school_day(conn, dt.datetime.now(dt.UTC)))
    except tt_pattern.Refused as no:
        raise HTTPException(status_code=no.status, detail=str(no)) from no


@keyed.post("/timetable/solve")
def solve(body: Solve, conn=Depends(get_conn, scope="function")):
    """An answer for these classes, checked by code, with its runs kept; the timetable is not changed."""

    def work(staff, today):
        if not body.class_ids:
            raise tt_pattern.Refused("Say which class to fill.")
        on = body.from_date or tt_pattern.next_unpublished(conn, body.class_ids[0], today)
        return tt_solve.solve(conn, staff, body.class_ids, on, today=today, seconds=body.seconds)

    return _run(conn, body.actor, work)


@keyed.post("/timetable/solve/use")
def use(body: Use, conn=Depends(get_conn, scope="function")):
    """Write an answer to the pattern as machine-made cells, all or none; returns each class's inverse (the Undo)."""
    return _run(
        conn,
        body.actor,
        lambda staff, today: tt_solve.use(conn, staff, body.run_ids, today=today, reason=body.reason),
    )
