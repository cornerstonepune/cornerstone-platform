"""CP-51: `POST /curriculum/approve`, a person approving the machine's links on one activity or objective. Only wiring:
what an approval does is `w1_bank/link_approve.py`. The curriculum gate is asked first, as a write."""

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from engine.api.deps import curriculum_staff, get_conn, get_tenant_id, require_engine_key
from engine.w1_bank import link_approve

router = APIRouter(prefix="/curriculum", dependencies=[Depends(require_engine_key)])


class Approve(BaseModel):
    actor: str
    kind: Literal["activity", "objective"]
    code: str


@router.post("/approve")
def approve(body: Approve, conn=Depends(get_conn, scope="function"), tenant_id: str = Depends(get_tenant_id)):
    staff = curriculum_staff(conn, body.actor, writes=True)
    n = link_approve.approve(conn, UUID(str(tenant_id)), body.kind, body.code, staff)
    return {"approved": n}
