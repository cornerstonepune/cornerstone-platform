"""CP-70's curriculum edits over HTTP: a coordinator changes an objective or an activity in place, puts it in another grade, ties or
unties its skills and objectives, reads its history and takes one change back. Only wiring: the rules are `w1_bank.curriculum_edit`'s.
The website asks with the engine's key and the signed-in person's email as `actor` (its route handlers call `requireStaff` first). A
sign-in not on the staff list is refused (403) and so is a write by anyone who is not a coordinator, with nothing written."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from engine.api.deps import get_conn, get_tenant_id, require_engine_key
from engine.w1_bank import curriculum_edit as edit
from engine.w3_read import voice_intake, voice_store

keyed = APIRouter(dependencies=[Depends(require_engine_key)])


class Who(BaseModel):
    actor: str
    reason: str | None = None


class Fields(Who):
    code: str
    changes: dict[str, str]


class Grade(Who):
    kind: str  # objective | activity
    code: str
    grade: str


class Tie(Who):
    table: str  # activity_skill | activity_objective | learning_objective_skill
    one: str
    other: str


class Look(Who):
    kind: str
    code: str


class Undo(Who):
    change_id: str


def _staff(conn, actor: str):
    try:
        return voice_intake.staff_of(conn, actor)
    except voice_store.Refused as no:
        raise HTTPException(status_code=no.status, detail=str(no)) from no


def _do(conn, body: Who, work):
    staff = _staff(conn, body.actor)
    t = get_tenant_id(conn)
    try:
        return work(t, staff)
    except edit.Refused as no:
        raise HTTPException(status_code=no.status, detail=str(no)) from no


@keyed.post("/curriculum/edit/objective")
def objective(body: Fields, conn=Depends(get_conn, scope="function")):
    return _do(conn, body, lambda t, s: edit.edit_objective(conn, t, s, body.code, body.changes, body.reason))


@keyed.post("/curriculum/edit/activity")
def activity(body: Fields, conn=Depends(get_conn, scope="function")):
    return _do(conn, body, lambda t, s: edit.edit_activity(conn, t, s, body.code, body.changes, body.reason))


@keyed.post("/curriculum/edit/grade/add")
def add_grade(body: Grade, conn=Depends(get_conn, scope="function")):
    return _do(
        conn,
        body,
        lambda t, s: {"grades": edit.add_grade(conn, t, s, body.kind, body.code, body.grade, body.reason)},
    )


@keyed.post("/curriculum/edit/grade/remove")
def remove_grade(body: Grade, conn=Depends(get_conn, scope="function")):
    return _do(
        conn,
        body,
        lambda t, s: {"grades": edit.remove_grade(conn, t, s, body.kind, body.code, body.grade, body.reason)},
    )


@keyed.post("/curriculum/edit/link")
def link(body: Tie, conn=Depends(get_conn, scope="function")):
    return _do(
        conn,
        body,
        lambda t, s: {"result": edit.link(conn, t, s, body.table, body.one, body.other, body.reason)},
    )


@keyed.post("/curriculum/edit/unlink")
def unlink(body: Tie, conn=Depends(get_conn, scope="function")):
    return _do(
        conn,
        body,
        lambda t, s: {"result": edit.unlink(conn, t, s, body.table, body.one, body.other, body.reason)},
    )


@keyed.post("/curriculum/edit/history")
def history(body: Look, conn=Depends(get_conn, scope="function")):
    """Anyone on the staff list may read it; only a coordinator may change anything."""
    return _do(conn, body, lambda t, s: {"history": edit.history(conn, t, body.kind, body.code)})


@keyed.post("/curriculum/edit/undo")
def undo(body: Undo, conn=Depends(get_conn, scope="function")):
    return _do(conn, body, lambda t, s: edit.undo(conn, t, s, body.change_id))
