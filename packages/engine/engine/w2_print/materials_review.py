"""What a person does with a note the system could not confirm (task M1-16, brick 2): put it on the class's list, or set it
aside with a reason; and approve a word or a unit so the next note needs no one. Putting it on the list goes through
`materials_list.add` like any other line, so every rule of a line holds. Nothing here asks a model."""

import datetime as dt
import json
import math
from decimal import Decimal
from typing import Any
from uuid import UUID

from engine.core import db, history
from engine.w2_print import materials_list as ml
from engine.w2_print.materials_text import norm


class NoSuchNote(Exception):
    """There is no such note in this school."""


class NotWaiting(Exception):
    """The note is already cleared: nothing is added a second time."""


class AliasTaken(Exception):
    """The word already means a different item."""


KIND = "materials_note"  # a note's reading that waits for a person: a row of the one proposal list


def waiting(conn: db.Conn, tenant: UUID) -> list[dict[str, Any]]:
    return [
        dict(r)
        for r in conn.execute(
            "select p.id, p.subject_code::uuid as list_id, p.proposal ->> 'text' as text, p.reason, p.created_at as at"
            " from curriculum_proposal p where p.tenant_id = %s and p.kind = %s and p.about is null"
            " and not exists (select 1 from curriculum_proposal d where d.about = p.id) order by p.created_at, p.id",
            (tenant, KIND),
        )
    ]


def _open(conn: db.Conn, tenant: UUID, note_id: UUID) -> dict[str, Any]:
    """The note, held (one person's answer at a time), or NoSuchNote / NotWaiting."""
    conn.execute("select pg_advisory_xact_lock(hashtext('materials_note'), hashtext(%s::text))", (note_id,))
    row = conn.execute(
        "select p.id, p.subject_code::uuid as list_id, exists (select 1 from curriculum_proposal d where d.about = p.id)"
        " as done from curriculum_proposal p where p.id = %s and p.tenant_id = %s and p.kind = %s and p.about is null",
        (note_id, tenant, KIND),
    ).fetchone()
    if row is None:
        raise NoSuchNote(str(note_id))
    if row["done"]:
        raise NotWaiting(str(note_id))
    return dict(row)


def _answer(
    conn: db.Conn, tenant: UUID, note: dict[str, Any], status: str, who: UUID, why: str, said: dict
) -> None:
    """A person's answer to a note: a later row naming it (`about`), as every answer on the proposal list is."""
    conn.execute(
        "insert into curriculum_proposal (tenant_id, about, run_id, kind, subject_code, proposal, status, reason,"
        " staff_id) values (%s, %s, gen_random_uuid(), %s, %s, %s, %s, %s, %s)",
        (tenant, note["id"], KIND, str(note["list_id"]), json.dumps(said), status, why, who),
    )


def resolve(
    conn: db.Conn,
    tenant: UUID,
    note_id: UUID,
    material_code: str,
    quantity: float,
    needed_on: dt.date,
    who: UUID,
) -> UUID:
    """Add what the note asked for to its list, as a line a person chose, and close the note. If the add is refused (not
    in the catalogue, already on the list, a bad quantity) the note stays waiting and nothing changes. Returns the list."""
    if isinstance(quantity, bool) or not math.isfinite(quantity) or quantity <= 0:
        raise ValueError("a quantity is a number above zero")
    note = _open(conn, tenant, note_id)
    ml.add(conn, note["list_id"], material_code, quantity, needed_on, None, who, via="note_review")
    _answer(conn, tenant, note, "applied", who, "", {"added": material_code, "quantity": quantity})
    return note["list_id"]


def dismiss(conn: db.Conn, tenant: UUID, note_id: UUID, why: str, who: UUID) -> None:
    why = norm(why)
    if not why:
        raise ValueError("a note set aside needs a reason")
    note = _open(conn, tenant, note_id)
    _answer(conn, tenant, note, "rejected", who, why, {})


def _item_unit(conn: db.Conn, tenant: UUID, code: str) -> str:
    row = conn.execute(
        "select unit from material_item where tenant_id = %s and code = %s", (tenant, code)
    ).fetchone()
    if row is None:
        raise ml.NotInCatalogue(code)
    return str(row["unit"])


def approve_alias(conn: db.Conn, tenant: UUID, alias: str, material_code: str, who: UUID) -> None:
    """A word a person approves for an item (`material_item.aliases`; CP-27 group 6: once the table `material_alias`):
    a word means one item in the school, so a word another item has is refused (AliasTaken). Each approval a row of the
    one history log."""
    word = norm(alias)
    if not word:
        raise ValueError("a word is needed")
    _item_unit(conn, tenant, material_code)
    conn.execute(
        "select pg_advisory_xact_lock(hashtext('material_item.aliases'), hashtext(%s))", (str(tenant),)
    )
    mine = conn.execute(
        "select code from material_item where tenant_id = %s and %s = any(aliases)", (tenant, word)
    ).fetchone()
    if mine is not None:
        if mine["code"] != material_code:
            raise AliasTaken(word)
        return
    conn.execute(
        "update material_item set aliases = aliases || %s::text where tenant_id = %s and code = %s",
        (word, tenant, material_code),
    )
    history.keep(
        conn,
        tenant,
        ("material_item", material_code, "alias"),
        None,
        {"alias": word},
        f"staff:{who}",
        staff=who,
    )


def approve_conversion(
    conn: db.Conn, tenant: UUID, material_code: str, unit: str, factor: float, who: UUID
) -> None:
    """`factor` of the item's own unit make one `unit` ("dozen" -> 12 piece), on the item (`material_item.conversions`;
    CP-27 group 6: once the table `material_unit_conversion`). A different factor replaces it; each approval, with the
    factor it replaced, a row of the one history log."""
    word = norm(unit)
    if not word:
        raise ValueError("a unit is needed")
    if isinstance(factor, bool) or not math.isfinite(factor) or factor <= 0:
        raise ValueError("a factor is a number above zero")
    if word == norm(_item_unit(conn, tenant, material_code)):
        raise ValueError("the item's own unit needs no conversion")
    latest = db.one(
        conn,
        "select conversions -> %s as factor from material_item where tenant_id = %s and code = %s for update",
        (word, tenant, material_code),
    )["factor"]
    if latest is not None and Decimal(str(latest)) == Decimal(str(factor)):
        return
    conn.execute(
        "update material_item set conversions = conversions || jsonb_build_object(%s::text, %s::numeric)"
        " where tenant_id = %s and code = %s",
        (word, factor, tenant, material_code),
    )
    history.keep(
        conn,
        tenant,
        ("material_item", material_code, "conversion"),
        None if latest is None else {"unit": word, "factor": float(latest)},
        {"unit": word, "factor": factor},
        f"staff:{who}",
        staff=who,
    )
