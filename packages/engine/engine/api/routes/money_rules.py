"""The money rules, for the Rules screen (CP-80): read them with the history in words, and save a change. Only wiring: the checks, the
words and the history are `core/money_rules`'s. From the site with the engine's key and the person's email as `actor`; a sign-in not on
the staff list is refused (403), and so is a save by anyone who may not set the rules, and a rule set that cannot work is a 422 in words."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from engine.api.deps import get_conn, require_engine_key
from engine.core import money_rules, signer

keyed = APIRouter(prefix="/money/rules", dependencies=[Depends(require_engine_key)])


class Who(BaseModel):
    actor: str


class Read(Who):
    history: bool = True  # False for a page that wants only `can_set` (the Setup card): no names are read


class Save(Who):
    rules: dict[str, Any]
    categories: list[str]
    reason: str | None = None


def _staff(conn, email: str) -> str:
    if (sid := signer.lookup(conn, email)) is None:
        raise HTTPException(status_code=403, detail="This sign-in is not on the staff list.")
    return sid


@keyed.post("/get")
def get(body: Read, conn=Depends(get_conn, scope="function")):
    staff = _staff(conn, body.actor)
    return {
        "rules": money_rules.current(conn),
        "categories": money_rules.categories(conn),
        "version": money_rules.version(conn),
        "can_set": money_rules.may_set(conn, staff),
        "history": money_rules.history(conn, body.actor) if body.history else [],
    }


@keyed.post("/set")
def save(body: Save, conn=Depends(get_conn, scope="function")):
    staff = _staff(conn, body.actor)
    try:
        return {"version": money_rules.save(conn, staff, body.rules, body.categories, body.reason)}
    except PermissionError as no:
        raise HTTPException(status_code=403, detail=str(no)) from no
    except ValueError as no:
        raise HTTPException(status_code=422, detail=str(no)) from no
