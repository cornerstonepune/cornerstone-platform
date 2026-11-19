"""The one list of materials (CP-84): search it, add to it, and give an item its category. Only wiring: one thing one item, the category rules and the
search are `core/catalogue.py` and `core/catalogue_category.py`; who may add is `w2_print/materials_list.may_add_item`. Like Money's and Stock's, every call is
a POST whose body carries `actor`, the signed-in person's email, whose staff id the engine finds (`signer.lookup`); a refusal is a 4xx with its words
(403 not allowed, 422 not possible)."""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from engine.api.deps import get_conn, get_tenant_id, require_engine_key
from engine.core import catalogue, signer
from engine.core import catalogue_category as category_of
from engine.w2_print import educator_gate
from engine.w2_print import materials_list as ml

keyed = APIRouter(prefix="/materials/items", dependencies=[Depends(require_engine_key)])


class Who(BaseModel):
    actor: str


class Search(Who):
    q: str | None = None


class Add(Who):
    name: str
    unit: str
    category: str


class Category(Who):
    material_code: str
    category: str


def _staff(conn, body: Who) -> str:
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


@keyed.post("/search")
def search(body: Search, conn=Depends(get_conn, scope="function"), tenant_id: str = Depends(get_tenant_id)):
    """Every item whose name or approved words match what was typed, by category (with nothing typed, every item), and the names close to it."""
    _staff(conn, body)
    return catalogue.search(conn, tenant_id, body.q)


@keyed.post("/add")
def add(body: Add, conn=Depends(get_conn, scope="function"), tenant_id: str = Depends(get_tenant_id)):
    staff = _staff(conn, body)
    if not ml.may_add_item(conn, UUID(staff), educator_gate.school_today(conn)):
        raise HTTPException(
            status_code=403,
            detail="You may add an item only if you hold a class, or are a coordinator or above.",
        )
    return _said(lambda: catalogue.add(conn, tenant_id, staff, body.name, body.unit, body.category))


@keyed.post("/category")
def set_category(
    body: Category, conn=Depends(get_conn, scope="function"), tenant_id: str = Depends(get_tenant_id)
):
    staff = _staff(conn, body)
    _said(lambda: category_of.set_category(conn, tenant_id, staff, body.material_code, body.category))
    return {
        "code": body.material_code,
        "category": conn.execute(
            "select category from material_item where tenant_id = %s and code = %s",
            (tenant_id, body.material_code),
        ).fetchone()["category"],
    }
