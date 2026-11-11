"""CP-31: a level's sentence, changed or read with its history. Only wiring: what is checked and written is
`w1_bank/level_words.py`. From the site with the engine's key and the person's email as `actor`; the gate is the
curriculum screens' (`curriculum_staff`): the preview only looks."""

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from engine.api.deps import curriculum_staff, get_conn, require_engine_key
from engine.w1_bank import level_words
from engine.w1_bank.level_words import Refused

keyed = APIRouter(dependencies=[Depends(require_engine_key)])


class Level(BaseModel):
    actor: str
    skill: str
    level: str


class NewWords(Level):
    words: str
    reason: str | None = None


class Before(BaseModel):
    at: dt.datetime
    staff: str | None  # a staff id, never a name
    was: str | None
    now: str | None
    reason: str | None


class Words(BaseModel):
    words: str | None
    approved: bool
    history: list[Before]


class Changed(Words):
    changed: bool


def _refused(no: Refused) -> HTTPException:
    return HTTPException(status_code=no.status, detail=str(no))


@keyed.post("/curriculum/level-words", response_model=Changed)
def change(body: NewWords, conn=Depends(get_conn, scope="function")):
    staff = curriculum_staff(conn, body.actor, writes=True)
    try:
        return level_words.change(conn, str(staff), body.skill, body.level, body.words, body.reason)
    except Refused as no:
        raise _refused(no) from no


@keyed.post("/curriculum/level-words/history", response_model=Words)
def history(body: Level, conn=Depends(get_conn, scope="function")):
    curriculum_staff(conn, body.actor)
    try:
        return level_words.read(conn, body.skill, body.level)
    except Refused as no:
        raise _refused(no) from no
