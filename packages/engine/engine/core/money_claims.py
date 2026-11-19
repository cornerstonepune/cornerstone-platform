"""A member of staff files a money claim and tracks it (MM-2a, CP-78).

A claim is one `expense` row, never deleted: its claimant withdraws it while it is submitted, and a person who holds the capability to
approve voids it with a reason. Each change is a `change_log` row (the table's trigger). The bill's photo is kept on the engine box, private,
as a lesson's photo is: the claim holds only its key. The version of the money rules a claim was filed under is pinned on it."""

import datetime as dt
from pathlib import Path
from typing import Any

from engine.core import db, history, money_rules, settings, staff

ROOT = db.REPO_ROOT / "data"
TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".heic": "image/heic",
    ".pdf": "application/pdf",
}
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
    ext = _bill_ext(bill, bill_ext)
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
        _keep_bill(conn, str(claim), spent_on, bill, ext)
    return str(claim)


def _bill_ext(bill: bytes | None, bill_ext: str) -> str:
    """The bill's file ending, lower case; refuses, in words, what is not a photo or a PDF, or is over 10 MB."""
    ext = bill_ext.lower() if bill else ""
    if bill and (ext not in TYPES or len(bill) > MOST):
        raise ValueError("the bill must be a photo or a PDF of at most 10 MB")
    return ext


def _keep_bill(conn: db.Conn, claim: str, spent_on: dt.date, bill: bytes, ext: str) -> None:
    key = f"receipts/{spent_on.year}/{claim}{ext}"
    (ROOT / key).parent.mkdir(parents=True, exist_ok=True)
    (ROOT / key).write_bytes(bill)
    conn.execute("update expense set receipt_key = %s where id = %s", (key, claim))


_DECISION = (
    "(select a.decision from approval a where a.tenant_id = e.tenant_id and a.kind = 'expense' and a.target = e.id::text"
    " and a.decision in ('approved', 'sent_back') order by a.seq desc limit 1)"
)
_WHY = _DECISION.replace("a.decision from", "a.reason from")


def _standing(row: dict[str, Any]) -> str:
    """Where a claim stands: voided or withdrawn on the claim, else paid, else what the last approval said, else submitted."""
    if row["status"] != "submitted":
        return str(row["status"])
    if row["paid_on"]:
        return "paid"
    return {"approved": "approved", "sent_back": "sent back"}.get(row["decision"], "submitted")


def _next(standing: str, row: dict[str, Any], to_founder: bool) -> str:
    """What happens next to a claim, as a sentence for its claimant."""
    paid = row["paid_on"]
    return {
        "submitted": "Waiting for a founder." if to_founder else "Waiting for your campus's operations lead.",
        "sent back": "Put it right and file it again.",
        "approved": "Approved. Waiting to be paid.",
        "paid": f"Paid on {paid.day} {paid:%b}, ref {row['payment_ref']}." if paid else "",
        "withdrawn": "You took it back.",
        "voided": "It will not go ahead.",
    }[standing]


def my_claims(conn: db.Conn, staff_id: Any) -> list[dict[str, Any]]:
    """The person's own claims, newest first: amount, date, vendor, category, campus, where it stands (submitted, sent back, approved, paid,
    withdrawn, voided), whether a bill is kept, and what happens next in words; once there is one, the reason or the payment's date and reference."""
    to_founder: dict[
        int, bool
    ] = {}  # a claim by someone who approves claims goes to a founder, by the rules it was filed under
    out: list[dict[str, Any]] = []
    for r in conn.execute(
        f"select e.id::text as id, e.amount, e.spent_on, e.vendor, e.category, c.name as campus, e.status, e.reason, e.created_at,"
        f" e.paid_on, e.payment_ref, e.receipt_key is not null as has_bill, e.rule_version, {_DECISION} as decision, {_WHY} as why"
        " from expense e join campus c on c.id = e.campus_id where e.claimant_id = %s order by e.created_at desc, e.id",
        (staff_id,),
    ).fetchall():
        standing = _standing(dict(r))
        if r["rule_version"] not in to_founder:
            rules = money_rules.at_version(conn, r["rule_version"])
            to_founder[r["rule_version"]] = money_rules.can(conn, staff_id, "approve", rules)
        out.append(
            {
                **r,
                "status": standing,
                "reason": r["reason"] or (r["why"] if standing == "sent back" else None),
                "next": _next(standing, r, to_founder[r["rule_version"]]),
            }
        )
    return [{k: v for k, v in r.items() if k not in ("decision", "why", "rule_version")} for r in out]


def add_bill(conn: db.Conn, staff_id: Any, claim: str, bill: bytes, bill_ext: str) -> None:
    """The claimant adds the bill to a claim that has none (a withdrawn or voided claim takes none)."""
    row = conn.execute(
        "select claimant_id, status, spent_on, receipt_key from expense where id = %s", (claim,)
    ).fetchone()
    if row is None or str(row["claimant_id"]) != str(staff_id):
        raise ValueError("that is not your claim")
    if row["status"] != "submitted":
        raise ValueError(f"a claim that is {row['status']} takes no bill")
    if row["receipt_key"]:
        raise ValueError("the claim already has its bill")
    if not bill:
        raise ValueError("the bill must be a photo or a PDF of at most 10 MB")
    history.by(conn, f"staff:{staff_id}")
    _keep_bill(conn, claim, row["spent_on"], bill, _bill_ext(bill, bill_ext))


def read_bill(conn: db.Conn, staff_id: Any, claim: str) -> tuple[str, bytes]:
    """→ the bill's type and bytes. Its claimant may read it, a person who may approve it on a campus they act for, and a person who may pay."""
    row = conn.execute(
        "select e.claimant_id, e.rule_version, e.receipt_key, c.name as campus from expense e join campus c on c.id = e.campus_id"
        " where e.id = %s",
        (claim,),
    ).fetchone()
    if row is None:
        raise ValueError("there is no such claim")
    rules = money_rules.at_version(conn, row["rule_version"])
    own = str(row["claimant_id"]) == str(staff_id)
    approves = row["campus"] in staff.campuses_of(conn, staff_id) and money_rules.reaches(
        conn, staff_id, rules["kinds"]["expense"]["approve"], rules
    )
    if not (own or approves or money_rules.can(conn, staff_id, "pay", rules)):
        raise PermissionError("that bill is not yours to see")
    if not row["receipt_key"] or not (ROOT / row["receipt_key"]).is_file():
        raise ValueError("the claim has no bill")
    return TYPES[Path(row["receipt_key"]).suffix], (ROOT / row["receipt_key"]).read_bytes()


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


def _claim(conn: db.Conn, claim: str) -> dict[str, Any]:
    row = conn.execute(
        f"select e.id::text as id, e.tenant_id, e.claimant_id, e.amount, e.spent_on, e.vendor, e.category, e.rule_version, e.status, e.paid_on,"
        f" c.name as campus,"
        f" {_DECISION} as decision from expense e join campus c on c.id = e.campus_id where e.id = %s",
        (claim,),
    ).fetchone()
    if row is None:
        raise ValueError("there is no such claim")
    return dict(row)


def _may_decide(conn: db.Conn, staff_id: Any, row: dict[str, Any]) -> None:
    """Refuses, in words, a person who may not approve or send back this claim, by the rules it was filed under."""
    rules = money_rules.at_version(conn, row["rule_version"])
    if row["status"] != "submitted" or row["decision"]:
        raise ValueError(f"the claim is already {_standing(row)}")
    if not money_rules.reaches(conn, staff_id, rules["kinds"]["expense"]["approve"], rules):
        raise PermissionError("you may not approve claims")
    if str(row["claimant_id"]) == str(staff_id):
        raise ValueError("your own claim cannot be approved by you")
    if row["campus"] not in staff.campuses_of(conn, staff_id):
        raise PermissionError("that claim is not your campus's")
    if money_rules.can(conn, row["claimant_id"], "approve", rules) and not money_rules.can(
        conn, staff_id, "pay", rules
    ):
        raise PermissionError("a claim by someone who approves claims goes to a founder")


def _decide(conn: db.Conn, staff_id: Any, claim: str, decision: str, reason: str | None) -> None:
    row = _claim(conn, claim)
    _may_decide(conn, staff_id, row)
    conn.execute(
        "insert into approval (tenant_id, kind, target, decision, by, reason, detail) values (%s, 'expense', %s, %s, %s, %s,"
        " jsonb_build_object('amount', %s::numeric, 'rule_version', %s::int))",
        (row["tenant_id"], claim, decision, str(staff_id), reason, row["amount"], row["rule_version"]),
    )


def approve(conn: db.Conn, staff_id: Any, claim: str) -> None:
    """A person the claim's rules let approve it, on its campus and not its claimant, approves it. A claim by someone who approves claims
    goes to a founder, who would pay it."""
    _decide(conn, staff_id, claim, "approved", None)


def send_back(conn: db.Conn, staff_id: Any, claim: str, reason: str) -> None:
    """The same person sends it back, saying why."""
    if not reason.strip():
        raise ValueError("say why the claim is sent back")
    _decide(conn, staff_id, claim, "sent_back", reason.strip())


def queue(conn: db.Conn, staff_id: Any) -> list[dict[str, Any]]:
    """The claims this person may approve now: submitted, undecided, on a campus they act for, not their own, by the rules each was filed under."""
    out: list[dict[str, Any]] = []
    for r in conn.execute(
        f"select e.id::text as id from expense e join campus c on c.id = e.campus_id where e.status = 'submitted' and c.name = any(%s)"
        f" and e.claimant_id <> %s and {_DECISION} is null order by e.created_at, e.id",
        (staff.campuses_of(conn, staff_id), staff_id),
    ).fetchall():
        row = _claim(conn, r["id"])
        try:
            _may_decide(conn, staff_id, row)
        except (ValueError, PermissionError):
            continue
        out.append({k: row[k] for k in ("id", "amount", "spent_on", "vendor", "category", "campus")})
    return out


def pay(conn: db.Conn, staff_id: Any, claim: str, paid_on: dt.date, mode: str, ref: str) -> None:
    """A person who holds the capability to pay, and is as high as the claim's pay tier names for its amount, pays an approved claim, saying
    when, how and the reference."""
    row = _claim(conn, claim)
    rules = money_rules.at_version(conn, row["rule_version"])
    if not money_rules.can(conn, staff_id, "pay", rules):
        raise PermissionError("you may not pay claims")
    if row["paid_on"]:
        raise ValueError("the claim is already paid")
    if row["status"] != "submitted" or row["decision"] != "approved":
        raise ValueError(f"the claim is not approved (it is {_standing(row)})")
    tier = next(
        t for t in rules["kinds"]["expense"]["pay"] if t["up_to"] is None or row["amount"] <= t["up_to"]
    )
    if not money_rules.reaches(conn, staff_id, tier["by"], rules):
        raise PermissionError(f"a claim of this amount is paid by a {tier['by']}")
    if not ref.strip() or not mode.strip():
        raise ValueError("give the payment's mode and reference")
    if paid_on > settings.school_today(conn):
        raise ValueError("the payment's date is in the future")
    history.by(conn, f"staff:{staff_id}")
    conn.execute(
        "update expense set paid_on = %s, payment_mode = %s, payment_ref = %s, paid_by = %s where id = %s",
        (paid_on, mode.strip(), ref.strip(), staff_id, claim),
    )
