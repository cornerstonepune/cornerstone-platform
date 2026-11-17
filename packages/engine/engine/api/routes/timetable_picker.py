"""CP-74: what a lesson teaches (specs/CP-74/spec.md; design D, F3). Only wiring: the ranking and the arithmetic are `tt_offer`'s and
`tt_fill`'s (pure), the rows and the writes `tt_offer_load`'s, `tt_fill_write`'s and `tt_edit`'s. From the site with the engine's key and the
person's email as `actor`. The coordinators, and the educator who holds the class, may read and choose; anyone else is refused (403) and
nothing is written; any other refusal is a 409 with its sentence. `/timetable/lessons/suggest` is the nightly job's door (n8n calls it; it
takes no person and writes machine-made rows only)."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from engine.api.deps import get_conn, require_engine_key
from engine.api.routes.timetable_hand import _staff
from engine.w2_print import fortnight_cycle as fc
from engine.w2_print import tt_fill_write, tt_offer_load
from engine.w2_print.tt_live_plan import Refused

keyed = APIRouter(dependencies=[Depends(require_engine_key)])


class Next(BaseModel):
    actor: str
    session_id: str
    lo_code: str | None = None  # the objective whose activities to list (default: the lesson's, else next up)


class FillItem(BaseModel):
    id: str
    lo_code: str


class Fill(BaseModel):
    actor: str
    session_id: str  # any lesson of the class and subject; its fortnight is the one filled
    mode: str  # same_as_last_week | spread | list
    unit: str | None = None
    codes: list[str] | None = None
    items: list[FillItem] | None = None
    dry: bool = False
    reason: str | None = None


class OrderCheck(BaseModel):
    actor: str
    grade: str
    subject: str
    yes: bool = True
    reason: str | None = None


def _refuse(no: Exception) -> HTTPException:
    return HTTPException(status_code=403 if "not in it" in str(no) else 409, detail=str(no))


@keyed.post("/timetable/lesson/next")
def lesson_next(body: Next, conn=Depends(get_conn, scope="function")):
    """The picker's read: next up, the rest of the unit, the next unit, the whole subject; the activities of one objective."""
    staff = _staff(conn, body.actor)
    try:
        return tt_offer_load.offers(conn, body.session_id, who=staff, lo_code=body.lo_code)
    except Refused as no:
        raise _refuse(no) from no


@keyed.post("/timetable/lessons/fill")
def lessons_fill(body: Fill, conn=Depends(get_conn, scope="function")):
    """Same as last week, a unit spread over the fortnight, or a list of lessons and objectives; `dry` writes nothing."""
    staff = _staff(conn, body.actor)
    try:
        return tt_fill_write.fill(
            conn, body.session_id, who=staff, mode=body.mode, unit=body.unit, codes=body.codes,
            items=[i.model_dump() for i in body.items] if body.items else None, dry=body.dry, reason=body.reason,
        )  # fmt: skip
    except (Refused, fc.CycleError) as no:
        raise _refuse(no) from no


@keyed.post("/timetable/lessons/suggest")
def lessons_suggest(conn=Depends(get_conn, scope="function")):
    """The nightly suggestion job: machine-made objectives on lessons nobody chose for; a second call writes nothing."""
    return tt_fill_write.suggest(conn)


@keyed.post("/timetable/order/check")
def order_check(body: OrderCheck, conn=Depends(get_conn, scope="function")):
    """A coordinator says a grade's subject is in the right teaching order (or takes it back)."""
    staff = _staff(conn, body.actor)
    try:
        return tt_offer_load.check_order(
            conn, staff, body.grade, body.subject, yes=body.yes, reason=body.reason
        )
    except Refused as no:
        raise _refuse(no) from no
