"""CP-49: the level each child reached in one lesson (`w3_read/lesson_level.py`). Only wiring. From the site with the
engine's key and her email as `actor`; not gated on `voice.screens_enabled` (the lesson page is the timetable's)."""

import datetime as dt
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator

from engine.api.deps import get_conn, require_engine_key
from engine.w3_read import lesson_level, voice_store

keyed = APIRouter(dependencies=[Depends(require_engine_key)])

Level = Annotated[int, Field(ge=0, le=3, strict=True)]


class ChildMark(BaseModel):
    child_id: str
    level: Level | None = None
    status: Literal["absent", "not_willing"] | None = None

    @model_validator(mode="after")
    def _one(self):
        if (self.level is None) == (self.status is None):
            raise ValueError("give a level or a status, not both and not neither")
        return self


class LessonRef(BaseModel):
    actor: str
    class_id: str
    session_id: str


class LevelWrite(LessonRef):
    day: dt.date | None = None
    marks: list[ChildMark] = Field(default_factory=list)
    rest_level: Level | None = None


def _refused(no: voice_store.Refused) -> HTTPException:
    return HTTPException(status_code=no.status, detail=str(no))


@keyed.post("/lesson/level")
def write(body: LevelWrite, conn=Depends(get_conn, scope="function")):
    """Mark children's levels in a lesson; `rest_level` sets every child enrolled that day with no mark yet."""
    try:
        return lesson_level.mark(
            conn, body.actor, body.class_id, body.session_id,
            [lesson_level.Mark(m.child_id, m.level, m.status) for m in body.marks], body.day, body.rest_level,
        )  # fmt: skip
    except voice_store.Refused as no:
        raise _refused(no) from no


@keyed.post("/lesson/level/read")
def read(body: LessonRef, conn=Depends(get_conn, scope="function")):
    """The lesson's current marks, no names."""
    try:
        return lesson_level.read(conn, body.actor, body.class_id, body.session_id)
    except voice_store.Refused as no:
        raise _refused(no) from no
