"""CP-64's curriculum write over HTTP: a coordinator confirms a batch of what the machine made. Only wiring: the rules are
`w1_bank.curriculum_confirm`'s. The website asks with the engine's key and the signed-in person's email as `actor`."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from engine.api.deps import get_conn, require_engine_key
from engine.w1_bank import curriculum_confirm
from engine.w2_print import educator_gate as gate
from engine.w3_read import voice_intake, voice_store

keyed = APIRouter(dependencies=[Depends(require_engine_key)])


class Confirm(BaseModel):
    actor: str
    grade: str
    subject: str | None = None  # a subject code; none for the objectives with no subject yet


@keyed.post("/curriculum/confirm")
def confirm(body: Confirm, conn=Depends(get_conn, scope="function")):
    """Move one grade and subject's machine-made rows to a person, with one approval row. 403 unless a coordinator; a second
    confirm changes nothing."""
    try:
        staff = voice_intake.staff_of(conn, body.actor)
    except voice_store.Refused as no:
        raise HTTPException(status_code=no.status, detail=str(no)) from no
    if not gate.sees_all(conn, staff):
        raise HTTPException(status_code=403, detail="Only a coordinator confirms what the machine made.")
    try:
        return curriculum_confirm.confirm(conn, staff, body.actor, body.grade, body.subject)
    except curriculum_confirm.Refused as no:
        raise HTTPException(status_code=no.status, detail=str(no)) from no
