"""What each campus's store holds (CP-82, Money & Materials MM-9): stock in, handed out, counted, written off, and the minimum it wants to keep.

One ledger, `stock_move`, never edited or deleted (a correction is a new move); what is on hand is the view `stock_level`, the last count plus the moves
after it. The campus is the store. Who keeps it is a setting (`stock.access`, roles on the money ladder): the campus's operations lead for the campus
they act for (`staff.campuses_of`), a coordinator or a founder for every campus. A refusal is in plain words: `PermissionError` for who, `ValueError`
for what, changing nothing."""

import datetime as dt
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any
from uuid import UUID

from engine.core import db, money_names, money_rules, settings, staff
from engine.core import stock_words as words

ACCESS = "stock.access"
TOLERANCE = "stock.count_tolerance"
REASONS = "stock.reasons"
_MOST = Decimal(10) ** 9  # numeric(12, 3): a quantity this large is a slip of the finger
_PLACES = Decimal("0.001")
_HISTORY_MOST = 200


@dataclass(frozen=True)
class Store:
    """A campus's store, as the person keeping it has opened it."""

    tenant: UUID
    campus_id: UUID
    campus: str
    staff_id: Any


def campuses(conn: db.Conn, staff_id: Any) -> list[str]:
    """The campuses whose store this person keeps; empty for a person who keeps none (they see no Stock line)."""
    rule: dict[str, str] = settings.config(conn, ACCESS, {})
    rules = money_rules.current(conn)
    if rule.get("every_campus") and money_rules.reaches(conn, staff_id, rule["every_campus"], rules):
        return [r["name"] for r in conn.execute("select name from campus order by name").fetchall()]
    if rule.get("keeper") and money_rules.reaches(conn, staff_id, rule["keeper"], rules):
        return sorted(staff.campuses_of(conn, staff_id))
    return []


def access(conn: db.Conn, staff_id: Any) -> dict[str, Any]:
    """→ `{"campuses": [...]}` (empty: no Stock line), and for a keeper the words a reason may take and the tolerance a count is held to."""
    mine = campuses(conn, staff_id)
    if not mine:
        return {"campuses": []}
    return {"campuses": mine, "reasons": settings.config(conn, REASONS, {}), "tolerance": _tolerance(conn)}


def keeps(conn: db.Conn, staff_id: Any) -> list[str]:
    """The campuses whose store this person keeps; refuses (`PermissionError`) a person who keeps none."""
    mine = campuses(conn, staff_id)
    if not mine:
        raise PermissionError("You do not keep a store, so Stock is not open to you.")
    return mine


def keeper(conn: db.Conn, staff_id: Any, campus: str) -> Store:
    """The store of `campus`, for a person who keeps it. Refuses a person who keeps no store, a campus that is none and a campus they do not keep."""
    mine = keeps(conn, staff_id)
    row = conn.execute(
        "select c.id, c.tenant_id from campus c join tenant t on t.id = c.tenant_id where t.slug = %s and c.name = %s",
        (db.tenant_slug(), campus),
    ).fetchone()
    if row is None:
        raise ValueError(f"There is no campus called {campus}.")
    if campus not in mine:
        raise PermissionError(f"You keep the store of {' and '.join(mine)}, not {campus}.")
    return Store(row["tenant_id"], row["id"], campus, staff_id)


def _tolerance(conn: db.Conn) -> dict[str, float]:
    """How far a count may be from the books before it needs a reason: the larger of `units` and `percent` of what the books said."""
    got: dict[str, float] = settings.config(conn, TOLERANCE, {})
    return {"units": got.get("units", 0), "percent": got.get("percent", 0)}


def _within(rule: dict[str, float], books: Decimal, counted: Decimal) -> bool:
    allowed = max(Decimal(str(rule["units"])), abs(books) * Decimal(str(rule["percent"])) / 100)
    return abs(counted - books) <= allowed


def quantity(value: Any, what: str, *, zero_ok: bool = False) -> Decimal:
    """A quantity as typed, to three places. Refuses what is not a number, a number below zero and (unless `zero_ok`) zero."""
    try:
        q = Decimal(str(value).strip())
    except InvalidOperation:
        q = Decimal("NaN")
    if not q.is_finite() or q < 0 or (q == 0 and not zero_ok):
        raise ValueError(f"{what} must be a number{' of zero or more' if zero_ok else ' above zero'}.")
    if q >= _MOST:
        raise ValueError(f"{what} is too large to be right: check the number.")
    return q.quantize(_PLACES)


def _reason(value: Any) -> str | None:
    """A reason as typed, or None when there is none."""
    return (str(value).strip() or None) if value else None


def _item(conn: db.Conn, store: Store, code: str) -> dict[str, Any]:
    row = conn.execute(
        "select code, name, unit from material_item where tenant_id = %s and code = %s", (store.tenant, code)
    ).fetchone()
    if row is None:
        raise ValueError(f"There is no item {code} in the materials catalogue.")
    return dict(row)


def levels(conn: db.Conn, store: Store) -> dict[str, tuple[Decimal, Decimal | None, int]]:
    """{item code: (on hand, minimum or None, how many moves the books hold for it besides a minimum)} for the items the store has a move for."""
    return {
        r["material_code"]: (r["on_hand"], r["minimum"], r["recorded"])
        for r in conn.execute(
            "select material_code, on_hand, minimum, recorded from stock_level where tenant_id = %s and campus_id = %s",
            (store.tenant, store.campus_id),
        ).fetchall()
    }


def _add(
    conn: db.Conn,
    store: Store,
    code: str,
    kind: str,
    q: Decimal,
    *,
    expected: Decimal | None = None,
    class_label: str | None = None,
    expense_id: Any = None,
    reason: str | None = None,
) -> None:
    conn.execute(
        "insert into stock_move (tenant_id, campus_id, material_code, kind, quantity, expected, class_label, expense_id, reason, staff_id)"
        " values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
        (
            store.tenant,
            store.campus_id,
            code,
            kind,
            q,
            expected,
            class_label,
            expense_id,
            reason,
            store.staff_id,
        ),
    )


def _claim(conn: db.Conn, store: Store, claim_id: Any) -> None:
    """Refuses a claim that is not the school's, one that was withdrawn or voided, and one made for another campus."""
    row = conn.execute(
        "select e.status, c.name as campus from expense e left join campus c on c.id = e.campus_id"
        " where e.tenant_id = %s and e.id = %s",
        (store.tenant, claim_id),
    ).fetchone()
    if row is None:
        raise ValueError("That claim is not one of the school's claims.")
    if row["status"] in ("withdrawn", "voided"):
        raise ValueError(f"That claim was {row['status']}: stock cannot be bought on it.")
    if row["campus"] not in (None, store.campus):
        raise ValueError(f"That claim was made for {row['campus']}, not {store.campus}.")


def stock_in(
    conn: db.Conn, staff_id: Any, campus: str, code: str, how_many: Any, claim_id: Any = None
) -> None:
    """Stock arrived: `how_many` of the item, and the claim it was bought on if there is one."""
    store = keeper(conn, staff_id, campus)
    item = _item(conn, store, code)
    q = quantity(how_many, f"How many {item['name']} came in")
    if claim_id:
        _claim(conn, store, claim_id)
    _add(conn, store, code, "in", q, expense_id=claim_id or None)


def hand_out(conn: db.Conn, staff_id: Any, campus: str, code: str, how_many: Any, class_label: str) -> None:
    """Stock handed to a class. Going below zero is allowed: the item then reads `count it`."""
    store = keeper(conn, staff_id, campus)
    item = _item(conn, store, code)
    q = quantity(how_many, f"How many {item['name']} were handed out")
    label = (class_label or "").strip()
    if not label:
        raise ValueError("Say which class the stock went to.")
    if (
        conn.execute(
            "select 1 from school_class where tenant_id = %s and label = %s limit 1", (store.tenant, label)
        ).fetchone()
        is None
    ):
        raise ValueError(f"There is no class called {label}.")
    _add(conn, store, code, "out", q, class_label=label)


def write_off(
    conn: db.Conn, staff_id: Any, campus: str, code: str, how_many: Any, reason: str | None
) -> None:
    """Stock that is lost, spoilt or used up for nothing a class took: refused without a reason."""
    store = keeper(conn, staff_id, campus)
    item = _item(conn, store, code)
    q = quantity(how_many, f"How many {item['name']} are written off")
    why = _reason(reason)
    if why is None:
        raise ValueError(f"Say why {item['name']} is written off: a write-off needs a reason.")
    _add(conn, store, code, "writeoff", q, reason=why)


def set_minimum(conn: db.Conn, staff_id: Any, campus: str, code: str, minimum: Any) -> None:
    """The least the campus wants to hold of an item; the newest wins, and zero says there is none."""
    store = keeper(conn, staff_id, campus)
    item = _item(conn, store, code)
    _add(conn, store, code, "minimum", quantity(minimum, f"The minimum of {item['name']}", zero_ok=True))


def _count_line(
    conn: db.Conn,
    store: Store,
    held: dict[str, tuple[Decimal, Decimal | None, int]],
    rule: dict[str, float],
    line: dict[str, Any],
) -> tuple[dict[str, Any], str | None]:
    """One line of a count → (what it will keep, what is wrong with it or None)."""
    code = str(line["material_code"])
    item = _item(conn, store, code)
    counted = quantity(line["counted"], f"The count of {item['name']}", zero_ok=True)
    books, _, recorded = held.get(code, (Decimal(0), None, 0))
    why = _reason(line.get("reason"))
    kept = {
        "material_code": code,
        "item": item["name"],
        "unit": item["unit"],
        "expected": books,
        "counted": counted,
        "reason": why,
    }
    if recorded and why is None and not _within(rule, books, counted):
        said = f"{words.said(counted)} counted, {words.said(books)} in the books"
        return kept, f"{item['name']}: {said}. Say why they differ."
    return kept, None


def count(conn: db.Conn, staff_id: Any, campus: str, lines: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """A termly count: on hand becomes what was counted, and the difference is kept. A line the books have nothing for (a first count) needs no
    reason; a difference above the tolerance does. Any line refused refuses the count, changing nothing.
    → `[{material_code, item, unit, expected, counted, difference}]`."""
    store = keeper(conn, staff_id, campus)
    if not lines:
        raise ValueError("Count at least one item.")
    held, rule = levels(conn, store), _tolerance(conn)
    kept: list[dict[str, Any]] = []
    wrong: list[str] = []
    for line in lines:
        got, problem = _count_line(conn, store, held, rule, line)
        if any(k["material_code"] == got["material_code"] for k in kept):
            problem = f"{got['item']} is counted twice."
        kept.append(got)
        if problem:
            wrong.append(problem)
    if wrong:
        raise ValueError("Nothing was saved. " + " ".join(wrong))
    for k in kept:
        _add(
            conn, store, k["material_code"], "count", k["counted"], expected=k["expected"], reason=k["reason"]
        )
    return [
        {
            "material_code": k["material_code"],
            "item": k["item"],
            "unit": k["unit"],
            "expected": words.number(k["expected"]),
            "counted": words.number(k["counted"]),
            "difference": words.number(k["counted"] - k["expected"]),
        }
        for k in kept
    ]


def on_hand(conn: db.Conn, staff_id: Any, campus: str) -> dict[str, Any]:
    """→ `{campus, items: [{code, name, unit, on_hand, minimum, word}]}`: every catalogue item the campus has a move for or whose classes' lists
    still need it, what needs the keeper first (`count it`, `none`, `low`), then `enough`, each by name."""
    store = keeper(conn, staff_id, campus)
    rows = conn.execute(
        "select i.code, i.name, i.unit, coalesce(l.on_hand, 0) as on_hand, l.minimum from material_item i"
        " left join stock_level l on l.tenant_id = i.tenant_id and l.campus_id = %(campus)s and l.material_code = i.code"
        " where i.tenant_id = %(tenant)s and (l.material_code is not null or exists ("
        "  select 1 from materials_line ml join materials_list li on li.id = ml.list_id"
        "  join school_class c on c.id = li.school_class_id"
        "  where ml.tenant_id = i.tenant_id and ml.material_code = i.code and ml.removed_at is null"
        "  and c.campus_id = %(campus)s and li.to_on >= %(today)s))",
        {"campus": store.campus_id, "tenant": store.tenant, "today": settings.school_today(conn)},
    ).fetchall()
    items: list[dict[str, Any]] = [
        {
            "code": r["code"],
            "name": r["name"],
            "unit": r["unit"],
            "on_hand": words.number(r["on_hand"]),
            "minimum": None if r["minimum"] is None else words.number(r["minimum"]),
            "word": words.word(r["on_hand"], r["minimum"]),
        }
        for r in rows
    ]
    items.sort(key=lambda i: (words.RANK[i["word"]], str(i["name"]).casefold()))
    return {"campus": campus, "items": items}


def history(
    conn: db.Conn, staff_id: Any, campus: str, code: str | None = None, most: int = _HISTORY_MOST
) -> dict[str, Any]:
    """→ `{campus, material_code, moves: [{on, kind, words, by, material_code, item}]}`, newest first: each move of the store (of one item, or of all)
    as a sentence, by the first name of who made it. `staff_id` is who asks, kept by the names read."""
    store = keeper(conn, staff_id, campus)
    if code:
        _item(conn, store, code)
    rows = conn.execute(
        "select m.kind, m.quantity, m.expected, m.class_label, m.reason, m.staff_id, m.at, m.material_code,"
        " i.name, i.unit, e.vendor, e.spent_on from stock_move m"
        " join material_item i on i.tenant_id = m.tenant_id and i.code = m.material_code"
        " left join expense e on e.id = m.expense_id"
        " where m.tenant_id = %s and m.campus_id = %s and (%s::text is null or m.material_code = %s)"
        " order by m.seq desc limit %s",
        (store.tenant, store.campus_id, code, code, most),
    ).fetchall()
    firsts: dict[Any, str] = {}
    moves: list[dict[str, Any]] = []
    for r in rows:
        if r["staff_id"] not in firsts:
            firsts[r["staff_id"]] = money_names.first_name(conn, r["staff_id"], f"staff:{staff_id}")
        claim = words.claim_words(r["vendor"], r["spent_on"]) if r["vendor"] else None
        moves.append(
            {
                "on": dt.date.isoformat(settings.school_day(conn, r["at"])),
                "kind": r["kind"],
                "words": words.move(r, r["name"], r["unit"], claim),
                "by": firsts[r["staff_id"]],
                "material_code": r["material_code"],
                "item": r["name"],
            }
        )
    return {"campus": campus, "material_code": code, "moves": moves}
