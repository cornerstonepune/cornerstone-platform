"""UI-5's class grants over HTTP: a coordinator lists, gives and ends them. Only wiring: the rules are
`w3_read.staff_grants` and the grant table's own. The website asks with the engine's key and the signed-in person's email
as `actor`."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from engine.api.deps import get_conn, require_engine_key
from engine.w3_read import staff_grants
from engine.w3_read.voice_store import Refused

router = APIRouter(dependencies=[Depends(require_engine_key)])


class Who(BaseModel):
    actor: str


class Give(Who):
    staff_id: str
    role: str
    class_label: str
    subject: str | None = None
    reason: str | None = None


class End(Who):
    grant_id: str


def _refused(no: Refused) -> HTTPException:
    return HTTPException(status_code=no.status, detail=str(no))


@router.post("/staff/grants")
def grants(body: Who, conn=Depends(get_conn, scope="function")):
    """The roles this page gives, the campus's classes, subjects and staff (ids), and every class grant (coordinators)."""
    try:
        return staff_grants.listing(conn, body.actor)
    except Refused as no:
        raise _refused(no) from no


@router.post("/staff/grants/give")
def give(body: Give, conn=Depends(get_conn, scope="function")):
    try:
        return staff_grants.give(
            conn, body.actor, body.staff_id, body.role, body.class_label, body.subject, body.reason
        )
    except Refused as no:
        raise _refused(no) from no


@router.post("/staff/grants/end")
def end(body: End, conn=Depends(get_conn, scope="function")):
    """End a grant today. The row stays, with its dates; nothing is deleted."""
    try:
        return staff_grants.end(conn, body.actor, body.grant_id)
    except Refused as no:
        raise _refused(no) from no
