"""Sending the materials list to the materials team (task M1-10; D-071). WhatsApp is the default: one tap opens it with
the list written out as a checklist, and the engine records exactly what text was sent and who tapped when. It cannot
know the message was read. Email is the second route; the engine has no mail sender, so it is recorded as 'not
configured' and the list stays a draft. A list that has been sent has no more reminders. A send is a row of the one run
list (`flow_run`, flow `materials_send`: request {list_id, route}, result {text, status}, `uploaded_by` who; CP-27
group 6: once the table `materials_send`); the team saying they have it is an `approval` row (kind `materials_ack`,
target the send)."""

import json
from typing import Any
from uuid import UUID

from engine.core import db, settings
from engine.w2_print import materials_text as text

SENT = ("opened", "sent")  # a send that went out; 'not configured' and 'failed' did not
FLOW = "materials_send"


class NothingToSend(Exception):
    pass


class NotSent(Exception):
    """The team cannot have what was never sent: an email with no sender behind it is a record of a try."""


def _lines(conn: db.Conn, list_id: UUID) -> list[text.Line]:
    return [
        text.Line(
            r["name"], None if r["quantity"] is None else float(r["quantity"]), r["unit"], r["needed_on"]
        )
        for r in conn.execute(
            "select i.name, l.quantity, l.unit, l.needed_on from materials_line l"
            " join material_item i on i.tenant_id = l.tenant_id and i.code = l.material_code"
            " where l.list_id = %s and l.removed_at is null order by l.needed_on, i.name",
            (list_id,),
        )
    ]


def _compose(conn: db.Conn, list_id: UUID, lock: bool = False) -> tuple[dict[str, Any], str | None]:
    """The list's row and its checklist (None when it has no lines). `lock` holds the row while it is sent."""
    lst = db.one(
        conn,
        "select l.*, c.grade_code, c.section from materials_list l join school_class c on c.id = l.school_class_id"
        f" where l.id = %s{' for update of l' if lock else ''}",
        (list_id,),
    )
    lines = _lines(conn, list_id)
    name = f"{lst['grade_code']} {lst['section'] or ''}".strip()
    return lst, text.checklist(name, lst["from_on"], lst["to_on"], lines) if lines else None


def current_text(conn: db.Conn, list_id: UUID) -> str | None:
    """The checklist as the list reads now, or None when it has no lines."""
    return _compose(conn, list_id)[1]


def send(conn: db.Conn, list_id: UUID, route: str, who: UUID) -> dict[str, Any]:
    lst, body = _compose(conn, list_id, lock=True)
    if body is None:
        raise NothingToSend("the list has no lines")
    link = None
    if route == "whatsapp":
        status = "opened"
        link = text.whatsapp_link(body, str(settings.config(conn, "materials.whatsapp_to", "") or ""))
    else:
        status = "not configured"
    row = db.one(
        conn,
        "insert into flow_run (tenant_id, flow, trigger, started_at, finished_at, status, request, result, uploaded_by)"
        " values (%s, %s, %s, clock_timestamp(), clock_timestamp(), 'ok', %s, %s, %s) returning id",
        (
            lst["tenant_id"],
            FLOW,
            route,
            json.dumps({"list_id": str(list_id), "route": route}),
            json.dumps({"text": body, "status": status}),
            who,
        ),
    )
    if status == "opened":  # a list sent has no reminders: they are worked out for a draft only
        conn.execute("update materials_list set state = 'sent', updated_at = now() where id = %s", (list_id,))
    return {"send_id": row["id"], "text": body, "status": status, "wa_link": link}


def team_has_it(conn: db.Conn, send_id: UUID, who: UUID) -> None:
    sent = db.one(
        conn,
        "select tenant_id, result ->> 'status' as status from flow_run where id = %s and flow = %s",
        (send_id, FLOW),
    )
    if sent["status"] not in SENT:
        raise NotSent(send_id)
    conn.execute(  # once a person: their second "the team has it" changes nothing
        "insert into approval (tenant_id, kind, target, decision, by) select %s, 'materials_ack', %s::text, 'approved',"
        " %s::text where not exists (select 1 from approval where kind = 'materials_ack' and target = %s::text"
        " and by = %s::text)",
        (sent["tenant_id"], send_id, who, send_id, who),
    )
