"""The money screens' routes for a member of staff's own claims (CP-80): the form's lists, file a claim, my claims, withdraw one,
add or read its bill. Only wiring: filing, tracking and the bill's rules are `core/money_claims.py`. The site calls with the engine's
key and the person's email as `actor`, whose staff id the engine finds (`signer.lookup`); a refusal is a 4xx with its words."""

import base64
import binascii
import datetime as dt
from decimal import Decimal
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from engine.api.deps import get_conn, require_engine_key
from engine.core import money_claims, settings, signer, staff

keyed = APIRouter(prefix="/money", dependencies=[Depends(require_engine_key)])


class Who(BaseModel):
    actor: str


class Create(Who):
    amount: str
    spent_on: dt.date
    vendor: str
    category: str
    campus: str
    subcategory: str | None = None
    note: str | None = None
    bill_b64: str | None = None
    bill_ext: str = ""


class One(Who):
    id: UUID


class AddBill(One):
    bill_b64: str
    bill_ext: str


def staff_of(conn, body: Who) -> str:
    sid = signer.lookup(conn, body.actor)
    if sid is None:
        raise HTTPException(status_code=403, detail="This sign-in is not on the staff list.")
    return sid


def _bytes(b64: str | None) -> bytes | None:
    try:
        return base64.b64decode(b64, validate=True) if b64 else None
    except (binascii.Error, ValueError) as no:
        raise HTTPException(status_code=422, detail="the bill could not be read: attach it again") from no


def _said(work) -> Any:
    """`work()`'s answer; a refusal in words becomes a 4xx with those words."""
    try:
        return work()
    except PermissionError as no:
        raise HTTPException(status_code=403, detail=str(no)) from no
    except ValueError as no:
        raise HTTPException(status_code=422, detail=str(no)) from no


def shown(claim: dict[str, Any]) -> dict[str, Any]:
    """A claim as the screens take it: money a string with two decimals, a date `YYYY-MM-DD`."""
    return {
        "id": claim["id"],
        "amount": f"{Decimal(claim['amount']):.2f}",
        "spent_on": claim["spent_on"].isoformat(),
        "vendor": claim["vendor"],
        "category": claim["category"],
        "subcategory": claim["subcategory"],
        "campus": claim["campus"],
        "status": claim["status"],
        "reason": claim["reason"],
        "paid_on": claim["paid_on"].isoformat() if claim["paid_on"] else None,
        "payment_ref": claim["payment_ref"],
        "has_bill": claim["has_bill"],
        "next": claim["next"],
    }


@keyed.post("/form")
def form(body: Who, conn=Depends(get_conn, scope="function")):
    sid = staff_of(conn, body)
    return {
        "categories": settings.config(conn, "money.categories", []),
        "subcategories": settings.config(conn, "money.subcategories", {}),
        "campuses": staff.campuses_of(conn, sid),
        "today": settings.school_today(conn).isoformat(),
    }


@keyed.post("/claims/create")
def create(body: Create, conn=Depends(get_conn, scope="function")):
    sid = staff_of(conn, body)
    bill = _bytes(body.bill_b64)
    return {
        "id": _said(
            lambda: money_claims.submit_claim(
                conn,
                sid,
                body.amount,
                body.spent_on,
                body.vendor,
                body.category,
                body.campus,
                (body.note or "").strip() or None,
                bill,
                body.bill_ext,
                body.subcategory,
            )
        )
    }


@keyed.post("/claims/mine")
def mine(body: Who, conn=Depends(get_conn, scope="function")):
    return {"claims": [shown(c) for c in money_claims.my_claims(conn, staff_of(conn, body))]}


@keyed.post("/claims/withdraw")
def withdraw(body: One, conn=Depends(get_conn, scope="function")):
    _said(lambda: money_claims.withdraw(conn, staff_of(conn, body), str(body.id)))
    return {}


@keyed.post("/claims/add_bill")
def add_bill(body: AddBill, conn=Depends(get_conn, scope="function")):
    bill = _bytes(body.bill_b64) or b""
    _said(lambda: money_claims.add_bill(conn, staff_of(conn, body), str(body.id), bill, body.bill_ext))
    return {}


@keyed.post("/claims/bill")
def bill(body: One, conn=Depends(get_conn, scope="function")):
    kind, content = _said(lambda: money_claims.read_bill(conn, staff_of(conn, body), str(body.id)))
    return {"content_type": kind, "b64": base64.b64encode(content).decode()}
