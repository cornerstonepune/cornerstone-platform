"""The coordinator's planning actions a screen will call (CP-24, audit F6): one thin keyed route beside each command.
Only wiring: the fortnight's state and its steps are `fortnight_cycle`'s (CP-6), a timetable draft is `tt_generate`'s
(CP-11). From the site with the engine's key and the person's email as `actor`; a sign-in not on the staff list is
refused (403) and nothing is written. No name is read or returned: `actor` becomes a staff id."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from engine.api.deps import get_conn, require_engine_key
from engine.core import db, settings
from engine.w2_print import cli_plan_link as links
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


class Link(BaseModel):
    actor: str
    fortnight: int | None = None
    band: str | None = None
    apply: bool = False


class Unmatched(BaseModel):
    actor: str
    fortnight: int | None = None
    band: str | None = None


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


def _band(conn, given: str | None) -> str:
    band = given or settings.config(conn, "timetable.link_band")
    if not band:
        raise HTTPException(
            status_code=409, detail="No band given and no timetable.link_band setting: run `engine load`."
        )
    return band


@keyed.post("/timetable/link")
def link(body: Link, conn=Depends(get_conn, scope="function")):
    """Link the plan lines that name exactly one activity, as `engine timetable link` does (CP-8): counts per
    fortnight, and with `apply` one run that `plan_link_undo` can undo as a whole. A dry run writes nothing."""
    _staff(conn, body.actor)
    tenant, band = db.tenant_slug(), _band(conn, body.band)
    run = None
    if body.apply:
        run = db.one(
            conn,
            "select plan_link_apply(t.id, %s, %s, %s) as run from tenant t where t.slug = %s",
            (band, links.BY, body.fortnight, tenant),
        )["run"]
    rows = links._lines(conn, tenant, band, body.fortnight)
    return {
        "run": str(run) if run else None,
        "summary": links._count_line(rows),
        "fortnights": {
            str(n): links._count_line([r for r in rows if r["fortnight"] == n])
            for n in sorted({r["fortnight"] for r in rows})
        },
    }


@keyed.post("/timetable/unmatched")
def unmatched(body: Unmatched, conn=Depends(get_conn, scope="function")):
    """The plan lines with no activity, each with its fortnight, week and reason (no_match, several_matches,
    ready_to_link): none is silently unlinked."""
    _staff(conn, body.actor)
    rows = links._lines(conn, db.tenant_slug(), _band(conn, body.band), body.fortnight)
    return {
        "lines": [
            {k: r[k] for k in ("fortnight", "week", "section", "plan_key", "text", "reason")}
            for r in rows
            if not r["linked"]
        ]
    }
