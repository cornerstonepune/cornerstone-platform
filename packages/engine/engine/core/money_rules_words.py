"""The money rules in plain words (CP-80): what a person reads on the Rules screen when a change is refused or listed.

A role, a kind of claim, a capability and a limit are each a code in the rules; none is shown to a person. This is the one place that
says each in the school's words, and `describe` compares two rule sets and says what changed, as "raised the payment-screenshot
limit from ₹500 to ₹700"."""

from typing import Any

ROLES = {
    "educator": "an educator",
    "ops": "the operations lead",
    "coordinator": "a coordinator",
    "founder": "a founder",
}
NAMES = {"educator": "educator", "ops": "operations lead", "coordinator": "coordinator", "founder": "founder"}
KINDS = {
    "expense": "an expense",
    "float_topup": "a float top-up",
    "capex": "equipment",
    "event_budget": "an event budget",
}
CAPABILITIES = {
    "submit": "file a claim",
    "approve": "approve a claim",
    "close_float": "close a float",
    "pay": "pay a claim",
    "set_budget": "set a budget",
    "set_rules": "change these rules",
}
# each limit: what it is called in a sentence, and its unit
LIMITS = {
    "capex_floor": ("the price above which a purchase counts as equipment", "₹"),
    "capex_min_life_months": ("how long equipment must last", "months"),
    "stock_line": ("the stock line", "₹"),
    "bill_missing_hours": ("the time allowed for a missing bill", "hours"),
    "screenshot_limit": ("the payment-screenshot limit", "₹"),
    "repeat_item_days": ("the days before the same item may be bought again", "days"),
    "advance_unsettled_days": ("the days allowed to settle an advance", "days"),
    "unpaid_after_approval_days": ("the days allowed to pay an approved claim", "days"),
    "report_day": ("the day of the month the report is made", "date"),
}
LIMIT_MOST = 100_000_000  # ten crore: no rupee, hour or day limit of a school is above it


def _plain(code: str) -> str:
    return code.replace("_", " ")


def role(code: str | None) -> str:
    return ROLES.get(str(code), _plain(str(code)))


def kind(code: str) -> str:
    return KINDS.get(code, _plain(code))


def limit(code: str) -> str:
    return LIMITS.get(code, (_plain(code), ""))[0]


def rupees(n: float) -> str:
    """₹ with Indian grouping and no paise: 700 → "₹700", 1234567 → "₹12,34,567"."""
    digits = str(round(n))
    if len(digits) > 3:
        head, tail = digits[:-3], digits[-3:]
        groups: list[str] = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        digits = ",".join([head, *groups, tail])
    return f"₹{digits}"


def _value(n: Any, unit: str) -> str:
    if not isinstance(n, (int, float)) or isinstance(n, bool):
        return str(n)
    if unit == "₹":
        return rupees(n)
    if unit == "date":
        day = int(n)
        return f"{day}{'th' if 11 <= day % 100 <= 13 else {1: 'st', 2: 'nd', 3: 'rd'}.get(day % 10, 'th')}"
    return f"{n} {unit.removesuffix('s') if n == 1 else unit}".strip()


def _order(ladder: list[str]) -> str:
    return ", ".join(NAMES.get(x, _plain(x)) for x in ladder)


def _moved(code: str, old: Any, new: Any) -> str:
    unit = LIMITS.get(code, ("", ""))[1]
    if old is None:
        return f"set {limit(code)} to {_value(new, unit)}"
    up = isinstance(new, (int, float)) and isinstance(old, (int, float)) and new > old
    verb = (
        "raised"
        if up
        else "lowered"
        if isinstance(new, (int, float)) and isinstance(old, (int, float))
        else "changed"
    )
    return f"{verb} {limit(code)} from {_value(old, unit)} to {_value(new, unit)}"


def payers(tiers: list[dict[str, Any]]) -> str:
    """Who pays, by amount: "a founder up to ₹10,000, then the finance lead"."""
    return ", then ".join(
        role(t.get("by")) + (f" up to {rupees(t['up_to'])}" if t.get("up_to") is not None else "")
        for t in tiers
    )


def describe(before: dict[str, Any], after: dict[str, Any]) -> list[str]:
    """What changed between two rule sets, one plain sentence each (no subject: the screen puts the person's first name before it)."""
    out = [
        _moved(code, before.get("limits", {}).get(code), new)
        for code, new in after.get("limits", {}).items()
        if before.get("limits", {}).get(code) != new
    ]
    if before.get("ladder") != after.get("ladder"):
        out.append(
            f"changed the order of the roles, lowest first, from {_order(before.get('ladder', []))} to {_order(after.get('ladder', []))}"
        )
    for cap, lowest in after.get("can", {}).items():
        if (old := before.get("can", {}).get(cap)) != lowest:
            out.append(
                f"changed who may {CAPABILITIES.get(cap, _plain(cap))} from {role(old)} to {role(lowest)}"
            )
    for code, route in after.get("kinds", {}).items():
        old = before.get("kinds", {}).get(code)
        if old is None:
            out.append(f"added a kind of claim: {kind(code)}")
            continue
        if old.get("approve") != route.get("approve"):
            out.append(
                f"changed who approves {kind(code)} from {role(old.get('approve'))} to {role(route.get('approve'))}"
            )
        if old.get("pay") != route.get("pay"):
            out.append(
                f"changed who pays {kind(code)}: now {payers(route.get('pay') or [])} (before: {payers(old.get('pay') or [])})"
            )
    out += [
        f"removed a kind of claim: {kind(code)}"
        for code in before.get("kinds", {})
        if code not in after.get("kinds", {})
    ]
    return out or (["changed the rules"] if before != after else [])


def describe_categories(before: list[str], after: list[str]) -> list[str]:
    out = [f"added the category “{c}”" for c in after if c not in before]
    out += [f"removed the category “{c}”" for c in before if c not in after]
    if not out and before != after:
        out.append("changed the order of the categories")
    return out
