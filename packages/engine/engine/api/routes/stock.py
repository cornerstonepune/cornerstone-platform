"""The Stock screens' routes (CP-82): what a campus holds, what it must buy, and the five things a keeper does (stock in, hand out, count, write off, set a
minimum). Only wiring: who keeps a store and every rule of the ledger are `core/stock.py`, the buy list is `w2_print/stock_buy.py`. Like Money's, every call
is a POST whose body carries `actor`, the signed-in person's email, whose staff id the engine finds (`signer.lookup`); a refusal is a 4xx with its words
(403 not allowed, 422 not possible)."""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from engine.api.deps import get_conn, require_engine_key
from engine.core import signer, stock
from engine.w2_print import stock_buy

keyed = APIRouter(prefix="/stock", dependencies=[Depends(require_engine_key)])


class Who(BaseModel):
    actor: str


class Store(Who):
    campus: str


class Item(Store):
    material_code: str


class In(Item):
    quantity: float
    expense_id: UUID | None = None


class Out(Item):
    quantity: float
    class_label: str


class WriteOff(Item):
    quantity: float
    reason: str = ""


class Minimum(Item):
    minimum: float


class Counted(BaseModel):
    material_code: str
    counted: float
    reason: str | None = None


class Count(Store):
    lines: list[Counted]


class History(Store):
    material_code: str | None = None


class BuyList(Store):
    month: str


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
    return stock.access(conn, staff_of(conn, body))


@keyed.post("/on-hand")
def on_hand(body: Store, conn=Depends(get_conn, scope="function")):
    return _said(lambda: stock.on_hand(conn, staff_of(conn, body), body.campus))


@keyed.post("/in")
def stock_in(body: In, conn=Depends(get_conn, scope="function")):
    _said(
        lambda: stock.stock_in(
            conn, staff_of(conn, body), body.campus, body.material_code, body.quantity, body.expense_id
        )
    )
    return {}


@keyed.post("/out")
def hand_out(body: Out, conn=Depends(get_conn, scope="function")):
    _said(
        lambda: stock.hand_out(
            conn, staff_of(conn, body), body.campus, body.material_code, body.quantity, body.class_label
        )
    )
    return {}


@keyed.post("/count")
def count(body: Count, conn=Depends(get_conn, scope="function")):
    lines = [line.model_dump() for line in body.lines]
    return {"lines": _said(lambda: stock.count(conn, staff_of(conn, body), body.campus, lines))}


@keyed.post("/writeoff")
def write_off(body: WriteOff, conn=Depends(get_conn, scope="function")):
    _said(
        lambda: stock.write_off(
            conn, staff_of(conn, body), body.campus, body.material_code, body.quantity, body.reason
        )
    )
    return {}


@keyed.post("/minimum")
def minimum(body: Minimum, conn=Depends(get_conn, scope="function")):
    _said(
        lambda: stock.set_minimum(conn, staff_of(conn, body), body.campus, body.material_code, body.minimum)
    )
    return {}


@keyed.post("/history")
def history(body: History, conn=Depends(get_conn, scope="function")):
    return _said(lambda: stock.history(conn, staff_of(conn, body), body.campus, body.material_code))


@keyed.post("/buy-list")
def buy_list(body: BuyList, conn=Depends(get_conn, scope="function")):
    return _said(lambda: stock_buy.buy_list(conn, staff_of(conn, body), body.campus, body.month))
