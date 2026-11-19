"""What a campus's store says in words (CP-82): a quantity as a person writes it, the plain word for how much of an item is held, and each move of the
ledger as a sentence. No arithmetic is decided here; the sums are `core/stock.py`'s and the view `stock_level`'s."""

import datetime as dt
from decimal import Decimal
from typing import Any

# How the words rank when the list is read: what needs the keeper first.
RANK = {"count it": 0, "none": 1, "low": 2, "enough": 3}


def number(q: Decimal) -> int | float:
    """A quantity as the screens take it: whole when it is whole, else with its decimals."""
    return int(q) if q == q.to_integral_value() else float(q)


def said(q: Decimal | int | float) -> str:
    """A quantity as a person writes it: 12, 2.5, never 12.000."""
    n = number(Decimal(str(q)))
    return str(n) if isinstance(n, int) else f"{n:g}"


def word(on_hand: Decimal, minimum: Decimal | None) -> str:
    """The plain word for how much is held: below zero the books are wrong (`count it`), none, below the minimum (`low`), or enough."""
    if on_hand < 0:
        return "count it"
    if on_hand == 0:
        return "none"
    return "low" if minimum is not None and on_hand < minimum else "enough"


def _difference(counted: Decimal, expected: Decimal) -> str:
    if counted == expected:
        return "the same as the books said"
    more = counted > expected
    return f"{said(abs(counted - expected))} {'more' if more else 'fewer'} than the books said"


def move(m: dict[str, Any], item: str, unit: str, claim: str | None) -> str:
    """One move as a sentence: what was done, how many, of what, and why where a reason was given. `claim` says which claim a stock in was bought on."""
    q, what = said(m["quantity"]), f"{item} ({unit})"
    reason = f": {m['reason']}" if m["reason"] else ""
    match m["kind"]:
        case "in":
            return f"Stock in: {q} of {what}" + (f", bought on {claim}" if claim else "")
        case "out":
            return f"Handed out {q} of {what} to {m['class_label']}"
        case "count":
            return f"Counted {q} of {what}; {_difference(m['quantity'], m['expected'])}{reason}"
        case "writeoff":
            return f"Written off {q} of {what}{reason}"
        case _:
            return f"Minimum set to {q} of {what}"


def claim_words(vendor: str, spent_on: dt.date) -> str:
    """A claim as a person knows it: its shop and the day it was spent."""
    return f"the claim for {vendor} of {spent_on:%d %b}"
