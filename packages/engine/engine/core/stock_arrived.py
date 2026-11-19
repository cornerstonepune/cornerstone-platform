"""What arrived, from the claim that bought it (CP-86): the keeper of a campus's store records the goods against an approved or paid claim of that campus, and
reads what has been recorded against it.

Nothing new is kept: a line is the ordinary stock in of `core/stock.py`, naming the claim (`stock_move.expense_id`, CP-82), so the ledger, the on-hand and the
history already say it. This only decides who may do it for a claim, and reads the claim's own moves. A refusal is in plain words: `PermissionError` for who,
`ValueError` for what, changing nothing."""

from typing import Any

from engine.core import db, money_claims, money_names, settings, stock
from engine.core import stock_words as words

ARRIVES = ("approved", "paid")  # the standings of a claim that goods may be recorded against


def _opened(conn: db.Conn, staff_id: Any, claim_id: Any) -> tuple[dict[str, Any], stock.Store]:
    """The claim and the store it was bought for, for a keeper of that campus. Refuses a person who keeps no store (asked first, so a stranger learns
    nothing of the claim), a claim that is none, and a keeper who does not act for the claim's campus."""
    mine = stock.keeps(conn, staff_id)
    claim = money_claims.standing_of(conn, str(claim_id))
    if claim is None:
        raise ValueError("That claim is not one of the school's claims.")
    if claim["campus"] not in mine:
        raise PermissionError(f"That claim was made for {claim['campus']}; you keep the store of {' and '.join(mine)}.")
    store = stock.keeper(conn, staff_id, claim["campus"])
    if claim["tenant"] != store.tenant:
        raise ValueError("That claim is not one of the school's claims.")
    return claim, store


def _moves(conn: db.Conn, asker: Any, store: stock.Store, claim_id: str) -> list[dict[str, Any]]:
    """The stock ins that name the claim, newest first, each with the first name of who recorded it."""
    firsts: dict[Any, str] = {}
    out: list[dict[str, Any]] = []
    for r in conn.execute(
        "select m.quantity, m.at, m.staff_id, m.material_code, i.name, i.unit from stock_move m"
        " join material_item i on i.tenant_id = m.tenant_id and i.code = m.material_code"
        " where m.tenant_id = %s and m.campus_id = %s and m.expense_id = %s and m.kind = 'in' order by m.seq desc",
        (store.tenant, store.campus_id, claim_id),
    ).fetchall():
        if r["staff_id"] not in firsts:
            firsts[r["staff_id"]] = money_names.first_name(conn, r["staff_id"], f"staff:{asker}")
        out.append(
            {
                "on": settings.school_day(conn, r["at"]).isoformat(),
                "item": r["name"],
                "material_code": r["material_code"],
                "quantity": words.number(r["quantity"]),
                "unit": r["unit"],
                "by": firsts[r["staff_id"]],
            }
        )
    return out


def arrived(conn: db.Conn, staff_id: Any, claim_id: Any) -> dict[str, Any]:
    """→ `{claim: {id, campus, status}, can_record, moves: [{on, item, material_code, quantity, unit, by}]}`: what has been recorded against the claim,
    newest first, and whether this keeper may record more (the claim is approved or paid)."""
    claim, store = _opened(conn, staff_id, claim_id)
    return {
        "claim": {"id": claim["id"], "campus": claim["campus"], "status": claim["status"]},
        "can_record": claim["status"] in ARRIVES,
        "moves": _moves(conn, staff_id, store, claim["id"]),
    }


def arrive(conn: db.Conn, staff_id: Any, claim_id: Any, lines: list[dict[str, Any]]) -> int:
    """Record what arrived: one stock in for each `{material_code, quantity}`, each naming the claim. All or nothing: a line with no quantity above zero or an
    item that is not in the catalogue refuses the whole call, and the words name every such line. → how many lines were recorded."""
    claim, store = _opened(conn, staff_id, claim_id)
    if claim["status"] not in ARRIVES:
        raise ValueError(f"That claim is {claim['status']}. Goods are recorded against an approved or a paid claim.")
    if not lines:
        raise ValueError("Say what arrived: add at least one item.")
    problems: list[str] = []
    with conn.transaction():  # a savepoint: the lines that were good are undone when another is not
        for line in lines:
            try:
                stock.stock_in(conn, staff_id, store.campus, str(line["material_code"]), line["quantity"], claim["id"])
            except ValueError as no:
                problems.append(str(no))
        if problems:
            raise ValueError("Nothing was saved. " + " ".join(problems))
    return len(lines)
