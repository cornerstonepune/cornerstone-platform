"""What waits on a person in Money (CP-80): the claims they may approve now and the approved ones they may pay now, each with who filed it.

Nothing is decided here: who may approve is `money_claims.queue` and who may pay is the claim's own pinned rules, the two the engine already judges
claims by. This only reads them, in the shape the screens take (money a string with two decimals, a date `YYYY-MM-DD`, a person by first name)."""

from decimal import Decimal
from typing import Any

from engine.core import db, money_claims, money_names, money_rules, staff

_COLUMNS = (
    "select e.id::text as id, e.amount, e.spent_on, e.vendor, e.category, c.name as campus, e.status, e.reason, e.paid_on, e.payment_ref,"
    " e.receipt_key is not null as has_bill, e.claimant_id, e.note, e.rule_version"
    " from expense e join campus c on c.id = e.campus_id"
)
_APPROVED = (  # the claim's last decision is an approval
    "(select a.decision from approval a where a.tenant_id = e.tenant_id and a.kind = 'expense' and a.target = e.id::text"
    " and a.decision in ('approved', 'sent_back') order by a.seq desc limit 1) = 'approved'"
)
_NEXT = {
    "approve": "Approve it, or send it back and say why.",
    "pay": "Pay it and mark it paid with the date, how and the reference.",
}


def access(conn: db.Conn, staff_id: Any) -> dict[str, Any]:
    """What this person may do in Money now, the campuses they act for, and how many claims wait on them."""
    can = {
        "approve": money_rules.can(conn, staff_id, "approve"),
        "pay": money_rules.can(conn, staff_id, "pay"),
        "set_rules": money_rules.may_set(conn, staff_id),
    }
    to_approve, to_pay = _waiting(conn, staff_id)
    return {
        "can": can,
        "campuses": staff.campuses_of(conn, staff_id),
        "counts": {"approve": len(to_approve), "pay": len(to_pay)},
    }


def queue(conn: db.Conn, staff_id: Any) -> dict[str, list[dict[str, Any]]]:
    """→ `{"approve": [...], "pay": [...]}`, each oldest first: the claims this person may approve now, and the approved, unpaid ones they may pay now."""
    asker = f"staff:{staff_id}"
    names: dict[Any, str] = {}  # one read of a person's name per person, each written to the access log

    def shown(row: dict[str, Any], kind: str) -> dict[str, Any]:
        if row["claimant_id"] not in names:
            names[row["claimant_id"]] = money_names.first_name(conn, row["claimant_id"], asker)
        return {
            "id": row["id"],
            "amount": f"{Decimal(row['amount']):.2f}",
            "spent_on": row["spent_on"].isoformat(),
            "vendor": row["vendor"],
            "category": row["category"],
            "campus": row["campus"],
            "status": "approved" if kind == "pay" else "submitted",
            "reason": row["reason"],
            "paid_on": row["paid_on"].isoformat() if row["paid_on"] else None,
            "payment_ref": row["payment_ref"],
            "has_bill": row["has_bill"],
            "next": _NEXT[kind],
            "claimant": names[row["claimant_id"]],
            "note": row["note"],
        }

    to_approve, to_pay = _waiting(conn, staff_id)
    return {"approve": [shown(r, "approve") for r in to_approve], "pay": [shown(r, "pay") for r in to_pay]}


def _waiting(conn: db.Conn, staff_id: Any) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    to_approve = _approvable(conn, staff_id) if money_rules.can(conn, staff_id, "approve") else []
    return to_approve, _payable(conn, staff_id)


def _approvable(conn: db.Conn, staff_id: Any) -> list[dict[str, Any]]:
    ids = [
        c["id"] for c in money_claims.queue(conn, staff_id)
    ]  # oldest first, by the rules each claim was filed under
    by_id = {
        r["id"]: dict(r) for r in conn.execute(f"{_COLUMNS} where e.id = any(%s::uuid[])", (ids,)).fetchall()
    }
    return [by_id[i] for i in ids if i in by_id]


def _payable(conn: db.Conn, staff_id: Any) -> list[dict[str, Any]]:
    """Approved and unpaid, and this person holds the capability to pay and is as high as the claim's pay tier names for its amount, both read
    from the rules the claim was filed under (the same test `money_claims.pay` makes before it records a payment)."""
    allowed: dict[tuple[int, str], bool] = {}  # by rule version and tier: the rules are read once per version
    versions: dict[int, dict[str, Any]] = {}
    out: list[dict[str, Any]] = []
    for r in conn.execute(
        f"{_COLUMNS} where e.status = 'submitted' and e.paid_on is null and {_APPROVED} order by e.created_at, e.id"
    ).fetchall():
        if r["rule_version"] not in versions:
            versions[r["rule_version"]] = money_rules.at_version(conn, r["rule_version"])
        rules = versions[r["rule_version"]]
        tier = next(
            t for t in rules["kinds"]["expense"]["pay"] if t["up_to"] is None or r["amount"] <= t["up_to"]
        )
        key = (r["rule_version"], tier["by"])
        if key not in allowed:
            allowed[key] = money_rules.can(conn, staff_id, "pay", rules) and money_rules.reaches(
                conn, staff_id, tier["by"], rules
            )
        if allowed[key]:
            out.append(dict(r))
    return out
