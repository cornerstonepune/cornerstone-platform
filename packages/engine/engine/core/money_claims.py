"""A member of staff files a money claim and tracks it (MM-2a, CP-78).

A claim is one `expense` row, never deleted: its claimant withdraws it while it is submitted, and a person who holds the capability to
approve voids it with a reason. Each change is a `change_log` row (the table's trigger). The bill's photo is kept on the engine box, private,
as a lesson's photo is: the claim holds only its key. The version of the money rules a claim was filed under is pinned on it."""

import datetime as dt
from typing import Any

from engine.core import db, history, money_rules, settings, staff

ROOT = db.REPO_ROOT / "data"
KINDS = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".pdf"}
MOST = 10 * 2**20


def _tenant(conn: db.Conn) -> Any:
    return db.one(conn, "select id from tenant where slug = %s", (db.tenant_slug(),))["id"]


def submit_claim(
    conn: db.Conn,
    staff_id: Any,
    amount: Any,
    spent_on: dt.date,
    vendor: str,
    category: str,
    campus: str,
    note: str | None = None,
    bill: bytes | None = None,
    bill_ext: str = "",
) -> str:
    """→ the claim's id. Refuses, in words and keeping nothing, a bad amount, a date in the future, no vendor, a category the school does not
    list, a campus the person does not act for, and a bill that is not a photo or a PDF, or is too large."""
    try:
        rupees = round(float(amount), 2)
    except (TypeError, ValueError):
        rupees = 0.0
    if rupees <= 0:
        raise ValueError("the amount must be more than nothing")
    if spent_on > settings.school_today(conn):
        raise ValueError("the date is in the future")
    if not vendor.strip():
        raise ValueError("say who was paid")
    if category not in settings.config(conn, "money.categories", []):
        raise ValueError(f"{category!r} is not a category of the school")
    if campus not in staff.campuses_of(conn, staff_id):
        raise ValueError(f"you do not act for the campus {campus!r}")
    ext = bill_ext.lower() if bill else ""
    if bill and (ext not in KINDS or len(bill) > MOST):
        raise ValueError("the bill must be a photo or a PDF of at most 10 MB")
    history.by(conn, f"staff:{staff_id}")
    claim = db.one(
        conn,
        "insert into expense (tenant_id, campus_id, claimant_id, spent_on, amount, vendor, category, note, rule_version)"
        " select %s, c.id, %s, %s, %s, %s, %s, %s, %s from campus c where c.tenant_id = %s and c.name = %s returning id",
        (
            _tenant(conn),
            staff_id,
            spent_on,
            rupees,
            vendor.strip(),
            category,
            note,
            money_rules.version(conn),
            _tenant(conn),
            campus,
        ),
    )["id"]
    if bill:
        key = f"receipts/{spent_on.year}/{claim}{ext}"
        (ROOT / key).parent.mkdir(parents=True, exist_ok=True)
        (ROOT / key).write_bytes(bill)
        conn.execute("update expense set receipt_key = %s where id = %s", (key, claim))
    return str(claim)


def my_claims(conn: db.Conn, staff_id: Any) -> list[dict[str, Any]]:
    """The person's own claims, newest first: amount, date, vendor, category, campus, status and, once it has one, the reason."""
    return [
        dict(r)
        for r in conn.execute(
            "select e.id::text as id, e.amount, e.spent_on, e.vendor, e.category, c.name as campus, e.status, e.reason, e.created_at"
            " from expense e join campus c on c.id = e.campus_id where e.claimant_id = %s order by e.created_at desc, e.id",
            (staff_id,),
        ).fetchall()
    ]


def _move(conn: db.Conn, by: Any, claim: str, to: str, reason: str | None) -> None:
    history.by(conn, f"staff:{by}")
    conn.execute("update expense set status = %s, reason = %s where id = %s", (to, reason, claim))


def withdraw(conn: db.Conn, staff_id: Any, claim: str) -> None:
    """The claimant takes back a claim still submitted. The row stays."""
    row = conn.execute("select claimant_id, status from expense where id = %s", (claim,)).fetchone()
    if row is None or str(row["claimant_id"]) != str(staff_id):
        raise ValueError("that is not your claim")
    if row["status"] != "submitted":
        raise ValueError(f"a claim that is {row['status']} cannot be withdrawn")
    _move(conn, staff_id, claim, "withdrawn", None)


def void(conn: db.Conn, staff_id: Any, claim: str, reason: str) -> None:
    """A person who holds the capability to approve voids a submitted claim, saying why. The row stays."""
    if not money_rules.can(conn, staff_id, "approve"):
        raise PermissionError("only someone who may approve claims may void one")
    if not reason.strip():
        raise ValueError("say why the claim is voided")
    row = conn.execute("select status from expense where id = %s", (claim,)).fetchone()
    if row is None or row["status"] != "submitted":
        raise ValueError("only a submitted claim can be voided")
    _move(conn, staff_id, claim, "voided", reason.strip())
