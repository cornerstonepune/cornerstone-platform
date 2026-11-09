"""The coordinator's planning actions a screen will call (CP-24, audit F6): one thin keyed route beside each command.
Only wiring: the fortnight's state and its steps are `fortnight_cycle`'s (CP-6), a timetable draft is `tt_generate`'s
(CP-11). From the site with the engine's key and the person's email as `actor`; a sign-in not on the staff list is
refused (403) and nothing is written. No name is read or returned: `actor` becomes a staff id."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from engine.api.deps import get_conn, require_engine_key
from engine.core import db, settings
from engine.w2_print import fortnight_cycle as fc
from engine.w2_print import tt_generate, tt_need
from engine.w3_read import voice_intake, voice_store

keyed = APIRouter(dependencies=[Depends(require_engine_key)])


class Fortnight(BaseModel):
    actor: str
    fortnight_id: str


class Move(Fortnight):
    to_state: str


class Draft(BaseModel):
    actor: str
    grade: str
    section: str
    year: str
    fortnight: int


def _staff(conn, email: str):
    try:
        return voice_intake.staff_of(conn, email)
    except voice_store.Refused as no:
        raise HTTPException(status_code=no.status, detail=str(no)) from no


def _refused(no: Exception, status: int = 409) -> HTTPException:
    return HTTPException(status_code=status, detail=str(no))


def _fortnight(text: str) -> str:
    try:
        return voice_intake.valid_id(text)
    except voice_store.Refused as no:
        raise HTTPException(status_code=no.status, detail=str(no)) from no


@keyed.post("/fortnight/state")
def state(body: Fortnight, conn=Depends(get_conn, scope="function")):
    """The fortnight's state, who took each step and when, and the day each step falls on."""
    _staff(conn, body.actor)
    fid = _fortnight(body.fortnight_id)
    row = conn.execute("select * from fortnight_cycle where fortnight_id = %s", (fid,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="That is not a teaching fortnight with a cycle.")
    try:
        dates = {step: fc.step_date(conn, fid, step).isoformat() for step in fc.STEPS}
    except fc.CycleError as no:
        raise _refused(no) from no
    return {**row, "step_dates": dates}


@keyed.post("/fortnight/move")
def move(body: Move, conn=Depends(get_conn, scope="function")):
    """Move the fortnight one step on, in the actor's name; a skipped or repeated step is refused in words."""
    staff = _staff(conn, body.actor)
    fid = _fortnight(body.fortnight_id)
    try:
        fc.move(conn, fid, body.to_state, str(staff))
    except fc.CycleError as no:
        raise _refused(no) from no
    return db.one(conn, "select state from fortnight_cycle where fortnight_id = %s", (fid,))


@keyed.post("/timetable/generate")
def generate(body: Draft, conn=Depends(get_conn, scope="function")):
    """A draft timetable for one class and one fortnight, made by FET and kept with its input and output, as
    `engine timetable generate` does. Writes nothing to the timetable itself."""
    _staff(conn, body.actor)
    try:
        run = tt_generate.generate(conn, body.grade, body.section, body.year, body.fortnight)
    except tt_need.NoSuchFortnight as no:
        raise _refused(no, 404) from no
    except settings.MissingSetting as no:
        raise _refused(no) from no
    tt_generate.keep(conn, run)
    return {
        "outcome": run.outcome,
        "needed": run.needed,
        "placed": run.placed,
        "report": run.report,
        "draft": run.draft,
        "lines": tt_generate.lines(run),
    }
