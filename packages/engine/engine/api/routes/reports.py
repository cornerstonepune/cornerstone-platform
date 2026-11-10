"""CP-19's reports over HTTP: a report's lines and their stages, writing the lines, a line's approval, the send, and the
coordinator's counts. Only wiring: the rules are `w4_close.report_lines` and the database's own. The website asks with
the engine's key and the signed-in person's email as `actor`."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from engine.api.deps import get_conn, require_engine_key
from engine.w3_read.voice_store import Refused
from engine.w4_close import report_lines

router = APIRouter(dependencies=[Depends(require_engine_key)])


class Who(BaseModel):
    actor: str


class ReportRef(Who):
    note_id: str


class Line(BaseModel):
    id: str | None = None
    words: str = Field(min_length=1)
    evidence: list[str] = []


class SetLines(ReportRef):
    lines: list[Line]


class LineRef(ReportRef):
    line_id: str


def _refused(no: Refused) -> HTTPException:
    return HTTPException(status_code=no.status, detail=str(no))


@router.post("/reports/lines")
def lines(body: ReportRef, conn=Depends(get_conn, scope="function")):
    """The report's lines, each with its stage (drafted, educator_approved, coordinator_approved), whether it is thin,
    who approved it (staff ids), and when the report was sent."""
    try:
        return report_lines.stages(conn, body.actor, body.note_id)
    except Refused as no:
        raise _refused(no) from no


@router.post("/reports/lines/set")
def set_lines(body: SetLines, conn=Depends(get_conn, scope="function")):
    try:
        return report_lines.set_lines(conn, body.actor, body.note_id, [x.model_dump() for x in body.lines])
    except Refused as no:
        raise _refused(no) from no


@router.post("/reports/lines/approve")
def approve_line(body: LineRef, conn=Depends(get_conn, scope="function")):
    try:
        return report_lines.approve_line(conn, body.actor, body.note_id, body.line_id)
    except Refused as no:
        raise _refused(no) from no


@router.post("/reports/send")
def send(body: ReportRef, conn=Depends(get_conn, scope="function")):
    """Mark a report sent (coordinators only). Nothing is delivered: no message leaves the system."""
    try:
        return report_lines.send(conn, body.actor, body.note_id)
    except Refused as no:
        raise _refused(no) from no


@router.post("/reports/counts")
def counts(body: Who, conn=Depends(get_conn, scope="function")):
    """The coordinator's counts, per class and per educator (staff ids): whole numbers, never a score or a rank."""
    try:
        return report_lines.counts(conn, body.actor)
    except Refused as no:
        raise _refused(no) from no
