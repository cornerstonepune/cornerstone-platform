"""What a campus must buy in a month (CP-82, Money & Materials MM-9): what its classes' lists need, less what the store holds, plus the top-up to the
minimum it wants to keep. Built by code, never a model. The need is the school's consolidated materials list (`materials_consolidate.gather`) cut to the
classes of one campus; a class that gives no quantity makes the need unknown (`to confirm`), never a smaller number, and an unknown need has no number to
buy. It opens as the same WhatsApp checklist the inventory person already gets (`materials_text`)."""

import datetime as dt
import re
from decimal import Decimal
from typing import Any
from uuid import UUID

from engine.core import db, settings, stock
from engine.core import stock_words as words
from engine.w2_print import materials_consolidate as consolidate
from engine.w2_print import materials_coverage as coverage
from engine.w2_print import materials_text as text

_NONE = Decimal(0)


def month_range(month: str) -> tuple[dt.date, dt.date]:
    """The first and last day of `YYYY-MM`. Refuses anything else, in words."""
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", month or ""):
        raise ValueError("Give the month as YYYY-MM, for example 2026-11.")
    first = dt.date.fromisoformat(f"{month}-01")
    return first, (first + dt.timedelta(days=32)).replace(day=1) - dt.timedelta(days=1)


def to_buy(need: Decimal | None, on_hand: Decimal, minimum: Decimal | None) -> Decimal | None:
    """What to buy: the need, plus the minimum the store should still hold after the month uses it, less what is held; never below zero. A store whose
    books went below zero (`count it`) is counted as holding none, so wrong books never inflate a purchase. An unknown need gives none."""
    if need is None:
        return None
    return max(_NONE, need + (minimum or _NONE) - max(on_hand, _NONE))


def _sources(
    mine: dict[UUID, dict[str, Any]], labels: dict[UUID, str], activities: dict[str, str]
) -> list[dict[str, str | None]]:
    out: list[dict[str, str | None]] = []
    for class_id, part in mine.items():
        named = sorted(str(activities.get(a, a)) for a in part["activity_codes"])
        names: list[str | None] = [*named] if named else [None]
        out += [{"class": labels[class_id], "activity": n} for n in names]
    return sorted(out, key=lambda s: (str(s["class"]), str(s["activity"])))


def _need(mine: dict[UUID, dict[str, Any]]) -> Decimal | None:
    return consolidate.total([part["quantity"] for part in mine.values()]) if mine else _NONE


def _lines(conn: db.Conn, store: stock.Store, lo: dt.date, hi: dt.date) -> list[dict[str, Any]]:
    needs, _ = consolidate.gather(conn, store.tenant, lo, hi)
    labels = {
        r["id"]: r["label"]
        for r in conn.execute(
            "select id, label from school_class where tenant_id = %s and campus_id = %s",
            (store.tenant, store.campus_id),
        )
    }
    held = stock.levels(conn, store)
    catalogue = {
        r["code"]: r
        for r in conn.execute(
            "select code, name, unit from material_item where tenant_id = %s", (store.tenant,)
        )
    }
    activities = {
        r["code"]: r["name"]
        for r in conn.execute("select code, name from activity where tenant_id = %s", (store.tenant,))
    }
    out: list[dict[str, Any]] = []
    for code in sorted(set(needs) | {c for c, (_, low, _) in held.items() if low}):
        mine = {c: p for c, p in needs.get(code, {"from": {}})["from"].items() if c in labels}
        on_hand, minimum, _ = held.get(code, (_NONE, None, 0))
        need = _need(mine)
        buy = to_buy(need, on_hand, minimum)
        if need == _NONE and not buy:
            continue  # no class needs it and the store is not below its minimum: not on this month's list
        item = catalogue[code]
        out.append(
            {
                "code": code,
                "name": item["name"],
                "unit": item["unit"],
                "need": None if need is None else words.number(need),
                "on_hand": words.number(on_hand),
                "minimum": None if minimum is None else words.number(minimum),
                "to_buy": None if buy is None else words.number(buy),
                "sources": _sources(mine, labels, activities),
            }
        )
    # what needs buying, or confirming, comes first
    out.sort(key=lambda ln: (ln["to_buy"] == 0, str(ln["name"]).casefold()))
    return out


def _without_list(conn: db.Conn, store: stock.Store, lo: dt.date, hi: dt.date) -> list[str]:
    """The campus's classes that have a plan for the month but no materials list yet: what they need is not in the buy list."""
    labels = {
        r["id"]: r["label"]
        for r in conn.execute(
            "select id, label from school_class where tenant_id = %s and campus_id = %s",
            (store.tenant, store.campus_id),
        )
    }
    listed = {
        r["school_class_id"]
        for r in conn.execute(
            "select distinct school_class_id from materials_list where tenant_id = %s and from_on <= %s and to_on >= %s",
            (store.tenant, hi, lo),
        )
    }
    expected = coverage.planned_classes(conn, store.tenant, lo, hi)
    return sorted(labels[c] for c in expected if c in labels and c not in listed)


def buy_list(conn: db.Conn, staff_id: Any, campus: str, month: str) -> dict[str, Any]:
    """→ `{campus, month, lines: [{code, name, unit, need|null, on_hand, minimum|null, to_buy|null, sources: [{class, activity}]}], classes_without_list,
    checklist_url}`. A line with `need` or `to_buy` null is `to confirm`. `checklist_url` opens WhatsApp with the lines still to buy (or to confirm) as
    a checklist; null when there is nothing to buy."""
    store = stock.keeper(conn, staff_id, campus)
    lo, hi = month_range(month)
    lines = _lines(conn, store, lo, hi)
    todo = [
        (ln["name"], ln["to_buy"], ln["unit"]) for ln in lines if ln["to_buy"] is None or ln["to_buy"] > 0
    ]
    number = str(settings.config(conn, "materials.inventory_whatsapp_to", "") or "")
    return {
        "campus": campus,
        "month": month,
        "lines": lines,
        "classes_without_list": _without_list(conn, store, lo, hi),
        "checklist_url": text.whatsapp_link(text.buy_checklist(campus, lo, todo), number) if todo else None,
    }
