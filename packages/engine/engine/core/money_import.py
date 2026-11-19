"""The school's expense sheet, filled in as history (CP-81, Nimish 2026-11-19: "real raw data - fill this into the database").

Two files, read by path from outside the repository (they hold names and rupees): the sheet's lines and the check of each line's bill file. Every line becomes
one claim of status `historic`, with the sheet's id kept so a second run changes nothing. A payer who is not on the staff list becomes an inactive member of
staff (no sign-in), so every claim has a real claimant and the name stays in `pii`. `plan` writes nothing and says what `apply` would do."""

import csv
import datetime as dt
import difflib
import re
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

from engine.core import db, history, money_rules, settings

BILL = {
    "Bill": "vendor_bill",
    "Payment proof only": "payment_proof",
    "No bill": "none",
}  # the sheet's words; "Not recorded" is none known
FLAGS = (("is_capex", "capex"), ("advance", "advance"), ("late_payment", "late"), ("urgent", "urgent"))
SAME = 0.85  # two spellings this alike, with the same first letter, are one person (Saylee, Sayalee)
NOT_STATED = "Payer not stated"


@dataclass
class Line:
    ref: str
    spent_on: dt.date
    amount: Decimal
    payer: str
    vendor: str
    category: str
    subcategory: str | None
    event: str | None
    campus: str | None
    tags: list[str]
    bill_quality: str | None
    bill_ref: str | None
    note: str


@dataclass
class Plan:
    lines: list[Line] = field(default_factory=lambda: [])
    skipped: list[tuple[str, str]] = field(default_factory=lambda: [])
    same: dict[str, str] = field(default_factory=lambda: {})  # a spelling → the one it is taken for
    dated: dict[str, int] = field(default_factory=lambda: {"month only": 0, "after today": 0})
    people: dict[str, int] = field(default_factory=lambda: {})  # payer → lines
    new_people: list[str] = field(default_factory=lambda: [])
    already: int = 0
    new_categories: list[str] = field(default_factory=lambda: [])


def _payer(raw: str) -> tuple[str, bool]:
    """→ the name as one spelling, and whether the sheet only implied it."""
    implied = "(implied)" in raw.lower()
    name = re.sub(r"\(implied\)", "", raw, flags=re.I).strip().title()
    return (name or NOT_STATED), implied


def _when(r: dict[str, str], today: dt.date) -> tuple[dt.date, str | None, list[str]] | str:
    """→ the day a line is dated, how it was found when the sheet gave none that can be used, and the notes that say so; or why the line is skipped."""
    month, given = r["month"].strip(), r["date"].strip()
    try:
        spent_on = dt.date.fromisoformat(given)
        if spent_on <= today:
            return spent_on, None, []
    except ValueError:
        pass
    if not re.fullmatch(r"\d{4}-\d{2}", month):
        return "no date and no month"
    return (
        dt.date.fromisoformat(f"{month}-01"),
        ("after today" if given else "month only"),
        [f"date in the sheet: {given or 'none'}; the first of its month is used"],
    )


def _notes(r: dict[str, str], implied: bool, amount: Decimal, when: list[str]) -> str:
    purpose = r["purpose_or_location_raw"].strip()
    said = [
        "a refund or an adjustment: the sheet's amount is negative" if amount < 0 else "",
        *when,
        "payer implied by the sheet" if implied else "",
        "" if purpose.lower() == "bill" else purpose,
        r["sheet_side_notes"].strip(),
        f"Founder: {r['founder_comment'].strip()}" if r["founder_comment"].strip() else "",
    ]
    return " | ".join(n for n in said if n)


def _line(
    r: dict[str, str], bill_file: str | None, today: dt.date, campuses: list[str]
) -> tuple[Line, str | None] | str:
    """→ the line and how its date was found, or why it is skipped."""
    try:
        amount = Decimal(r["amount_inr"].strip())
    except InvalidOperation:
        amount = Decimal(0)
    if amount == 0:
        return "no amount"
    when = _when(r, today)
    if isinstance(when, str):
        return when
    spent_on, how, said = when
    payer, implied = _payer(r["paid_by"])
    campus = r["campus"].strip()
    return (
        Line(
            ref=r["line_id"].strip(),
            spent_on=spent_on,
            amount=amount,
            payer=payer,
            vendor=(r["description"].strip() or "(not stated)")[:200],
            category=r["category"].strip(),
            subcategory=r["cost_stream"].strip() or None,
            event=r["event"].strip() or None,
            campus=campus if campus in campuses else None,
            tags=[tag for col, tag in FLAGS if r[col].strip().upper() == "Y"],
            bill_quality=BILL.get(r["bill_status"].strip()),
            bill_ref=bill_file or None,
            note=_notes(r, implied, amount, said),
        ),
        how,
    )


def _alike(counts: dict[str, int]) -> dict[str, str]:
    """The spellings taken for another: the commonest spelling stands for the others; a tie goes to the first alphabetically."""
    same: dict[str, str] = {}
    order = sorted(counts, key=lambda n: (-counts[n], n))
    for at, name in enumerate(order):
        for other in order[:at]:
            if (
                other not in same
                and other[:1] == name[:1]
                and difflib.SequenceMatcher(None, name.lower(), other.lower()).ratio() >= SAME
            ):
                same[name] = other
                break
    return same


def read(expenses: Path, bills: Path, today: dt.date, campuses: list[str]) -> Plan:
    """The lines of the two files, each with what is made of it, and what is skipped and why. Writes nothing."""
    match = {
        r["line_id"]: r["matched_file_title"].strip()
        for r in csv.DictReader(bills.open(encoding="utf-8-sig"))
    }
    plan = Plan()
    for r in csv.DictReader(expenses.open(encoding="utf-8-sig")):
        got = _line(r, match.get(r["line_id"].strip()), today, campuses)
        if isinstance(got, str):
            plan.skipped.append((r["line_id"].strip(), got))
            continue
        plan.lines.append(got[0])
        if got[1]:
            plan.dated[got[1]] += 1
    counts: dict[str, int] = {}
    for ln in plan.lines:
        counts[ln.payer] = counts.get(ln.payer, 0) + 1
    plan.same = _alike(counts)
    for ln in plan.lines:
        ln.payer = plan.same.get(ln.payer, ln.payer)
        plan.people[ln.payer] = plan.people.get(ln.payer, 0) + 1
    return plan


def _first_names(conn: db.Conn) -> dict[str, list[Any]]:
    out: dict[str, list[Any]] = {}
    for r in conn.execute("select staff_id, name from pii.staff").fetchall():
        out.setdefault(str(r["name"]).split()[0].title(), []).append(r["staff_id"])
    return out


def plan(conn: db.Conn, expenses: Path, bills: Path) -> Plan:
    """`read`, then what the database already has: lines done before, the people who are not on the staff list, the categories the settings lack."""
    campuses = [r["name"] for r in conn.execute("select name from campus").fetchall()]
    p = read(expenses, bills, settings.school_today(conn), campuses)
    done = {
        r["source_ref"]
        for r in conn.execute("select source_ref from expense where source_ref is not null").fetchall()
    }
    p.already = sum(1 for ln in p.lines if ln.ref in done)
    p.lines = [ln for ln in p.lines if ln.ref not in done]
    known = _first_names(conn)
    p.people = {n: c for n, c in p.people.items() if n in {ln.payer for ln in p.lines}}
    p.new_people = sorted(n for n in p.people if len(known.get(n, [])) != 1)
    have = settings.config(conn, "money.categories", [])
    p.new_categories = sorted({ln.category for ln in p.lines} - set(have))
    return p


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "payer"


def apply(conn: db.Conn, p: Plan) -> dict[str, int]:
    """Write the plan in the caller's transaction: the missing categories, an inactive member of staff for each new payer, and every line as a historic
    claim. → what was written."""
    tenant = db.one(conn, "select id from tenant where slug = %s", (db.tenant_slug(),))["id"]
    if p.new_categories:
        settings.put(
            conn, "money.categories", [*settings.config(conn, "money.categories", []), *p.new_categories]
        )
    known = _first_names(conn)
    who: dict[str, Any] = {n: ids[0] for n, ids in known.items() if len(ids) == 1}
    for name in p.new_people:
        who[name] = db.one(
            conn,
            "insert into staff (tenant_id, campus_id, active) select %s, (select id from campus where tenant_id = %s order by created_at, name limit 1), false returning id",
            (tenant, tenant),
        )["id"]
        email = f"former-{_slug(name)}-{str(who[name])[:6]}@school.invalid"
        conn.execute(
            "insert into pii.staff (tenant_id, staff_id, name, email) values (%s, %s, %s, %s)",
            (tenant, who[name], name, email),
        )
    history.by(conn, "import:expense-sheet")
    version = money_rules.version(conn)
    for ln in p.lines:
        conn.execute(
            "insert into expense (tenant_id, campus_id, claimant_id, spent_on, amount, vendor, category, subcategory, event, tags, bill_quality, bill_ref,"
            " note, source_ref, rule_version, status, created_at) select %s, (select id from campus where tenant_id = %s and name = %s), %s, %s, %s, %s, %s, %s, %s,"
            " %s, %s, %s, %s, %s, %s, 'historic', %s::timestamptz",
            (
                tenant, tenant, ln.campus, who[ln.payer], ln.spent_on, ln.amount, ln.vendor, ln.category, ln.subcategory, ln.event, ln.tags,
                ln.bill_quality, ln.bill_ref, ln.note or None, ln.ref, version, f"{ln.spent_on} 12:00+00",
            ),
        )  # fmt: skip
    return {
        "claims": len(p.lines),
        "people added": len(p.new_people),
        "categories added": len(p.new_categories),
    }
