"""The money screens' routes for what waits on a person (CP-80): what they may do in Money, the claims to approve and to pay, and the three decisions
(approve, send back, mark paid). Only wiring: who may decide, and by which rules, is `core/money_claims.py`. The site calls with the engine's key and the
person's email as `actor`, whose staff id the engine finds (`signer.lookup`); a refusal is a 4xx with its words (403 not allowed, 422 not possible)."""

import datetime as dt
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from engine.api.deps import get_conn, require_engine_key
from engine.core import money_claims, money_queue, signer

keyed = APIRouter(prefix="/money", dependencies=[Depends(require_engine_key)])


class Who(BaseModel):
    actor: str


class One(Who):
    id: UUID


class SendBack(One):
    reason: str


class Pay(One):
    paid_on: dt.date
    mode: str
    ref: str


def staff_of(conn, body: Who) -> str:
    sid = signer.lookup(conn, body.actor)
    if sid is None:
        raise HTTPException(status_code=403, detail="This sign-in is not on the staff list.")
    return sid


def _said(work) -> Any:
    """`work()`'s answer; a refusal in words becomes a 4xx with those words."""
    try:
        return work()
    except PermissionError as no:
        raise HTTPException(status_code=403, detail=str(no)) from no
    except ValueError as no:
        raise HTTPException(status_code=422, detail=str(no)) from no


@keyed.post("/access")
def access(body: Who, conn=Depends(get_conn, scope="function")):
    return money_queue.access(conn, staff_of(conn, body))


@keyed.post("/queue")
def queue(body: Who, conn=Depends(get_conn, scope="function")):
    return money_queue.queue(conn, staff_of(conn, body))


@keyed.post("/approve")
def approve(body: One, conn=Depends(get_conn, scope="function")):
    _said(lambda: money_claims.approve(conn, staff_of(conn, body), str(body.id)))
    return {}


@keyed.post("/send_back")
def send_back(body: SendBack, conn=Depends(get_conn, scope="function")):
    _said(lambda: money_claims.send_back(conn, staff_of(conn, body), str(body.id), body.reason))
    return {}


@keyed.post("/pay")
def pay(body: Pay, conn=Depends(get_conn, scope="function")):
    _said(
        lambda: money_claims.pay(conn, staff_of(conn, body), str(body.id), body.paid_on, body.mode, body.ref)
    )
    return {}
