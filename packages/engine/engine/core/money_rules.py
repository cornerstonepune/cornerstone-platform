"""The money rules the co-founders set (MM-1, D-078): one setting, `money.rules`, and the history of its changes.

Roles are one ladder: each holds everything the roles below it hold. No table: the rules are a `config` row, a change is a
`change_log` row (who, when, before, after), and the version a claim pins is a count of those rows. A claim submitted at version n
is judged by `at_version(n)`, whatever is changed after."""

from typing import Any

from engine.core import db, money_names, settings
from engine.core import history as kept
from engine.core import money_rules_words as words

KEY = "money.rules"
CATEGORIES = "money.categories"
CATEGORY_MOST = 60  # letters in a category's name: the claim form and the cards show it whole


def current(conn: db.Conn) -> dict[str, Any]:
    return settings.config(conn, KEY, {})


def rank(rules: dict[str, Any], role: str | None) -> int:
    """How far up the ladder a role is; -1 for a role not on it."""
    ladder: list[str] = rules.get("ladder", [])
    return ladder.index(role) if role in ladder else -1


def holds(rules: dict[str, Any], role: str | None, capability: str) -> bool:
    """A role holds a capability when it is as high on the ladder as the lowest role the rules give it."""
    lowest: str | None = rules.get("can", {}).get(capability)
    return lowest is not None and rank(rules, lowest) >= 0 and rank(rules, role) >= rank(rules, lowest)


def limit_problems(rules: dict[str, Any]) -> list[str]:
    """A limit that is not a sensible number, and a report day off the calendar."""
    out = [
        f"{words.limit(code)} must be a number from 0 to 10 crore"
        for code, value in rules.get("limits", {}).items()
        if isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not 0 <= value <= words.LIMIT_MOST
    ]
    day = rules.get("limits", {}).get("report_day", 1)
    if isinstance(day, (int, float)) and not 1 <= day <= 28:
        out.append("the report must be made on a day from the 1st to the 28th")
    return out


def problems(rules: dict[str, Any]) -> list[str]:
    """Why a rule set cannot work, in words a person reads; empty when it can: a role off the ladder, a kind of claim approved or paid by a
    role that does not hold that capability, an amount no one pays, a limit that is not a sensible number, or a claimant allowed to approve
    their own claim."""
    out = (
        []
        if rules.get("self_approval") is False
        else ["nobody may approve their own claim, and that cannot be switched off"]
    )
    if not rules.get("ladder"):
        out.append("the ladder of roles is empty")
    for capability in ("submit", "approve", "pay", "set_rules"):
        if rank(rules, rules.get("can", {}).get(capability)) < 0:
            out.append(f"no role on the ladder may {words.CAPABILITIES[capability]}")
    kinds: dict[str, dict[str, Any]] = rules.get("kinds", {})
    if not kinds:
        out.append("no kind of claim has a route")
    for code, route in kinds.items():
        kind = words.kind(code)
        if not holds(rules, route.get("approve"), "approve"):
            out.append(
                f"{kind} is approved by {words.role(route.get('approve'))}, who may not approve claims"
            )
        tiers: list[dict[str, Any]] = route.get("pay") or []
        if not tiers or tiers[-1].get("up_to") is not None:
            out.append(
                f"no one is set to pay {kind} above the last limit: the last payer must cover any amount"
            )
        ceilings: list[float] = [t["up_to"] for t in tiers if t.get("up_to") is not None]
        if ceilings != sorted(ceilings):
            out.append(f"the limits for paying {kind} must go up, not down")
        out += [
            f"{kind} is paid by {words.role(t.get('by'))}, who cannot pay"
            for t in tiers
            if not holds(rules, t.get("by"), "pay")
        ]
    return out + limit_problems(rules)


def roles_of(conn: db.Conn, staff_id: Any) -> list[str]:
    """The role a member of staff has and the roles granted to them today."""
    today = settings.school_today(conn)
    return [
        r["role_code"]
        for r in conn.execute(
            "select role_code from staff where id = %s and role_code is not null union select role_code from staff_role_grant"
            " where staff_id = %s and valid_from <= %s and (valid_to is null or valid_to > %s)",
            (staff_id, staff_id, today, today),
        ).fetchall()
    ]


def can(conn: db.Conn, staff_id: Any, capability: str, rules: dict[str, Any] | None = None) -> bool:
    """Whether this member of staff holds the capability, by the current rules or by the `rules` given (a claim's pinned version)."""
    rules = rules or current(conn)
    return any(holds(rules, r, capability) for r in roles_of(conn, staff_id))


def reaches(conn: db.Conn, staff_id: Any, role: str, rules: dict[str, Any]) -> bool:
    """Whether this member of staff is as high on the ladder as `role`."""
    return any(rank(rules, r) >= rank(rules, role) >= 0 for r in roles_of(conn, staff_id))


def may_set(conn: db.Conn, staff_id: Any) -> bool:
    return can(conn, staff_id, "set_rules")


def _log(conn: db.Conn) -> list[Any]:
    return conn.execute(
        "select before, after from change_log where table_name = 'config' and row_id = %s and op = 'set' order by at, id",
        (KEY,),
    ).fetchall()


def version(conn: db.Conn) -> int:
    """The number a claim pins when it is submitted: 1 for the rules as seeded, one more for each accepted change."""
    return len(_log(conn)) + 1


def at_version(conn: db.Conn, n: int) -> dict[str, Any]:
    """The rules a claim of version `n` is judged by: version 1 is what the first change replaced, version n what the change before it made."""
    log = _log(conn)
    if not 1 <= n <= len(log) + 1:
        raise ValueError(f"there is no version {n} of the money rules; the latest is {len(log) + 1}")
    return current(conn) if not log else (log[0]["before"] if n == 1 else log[n - 2]["after"])


def set_rules(conn: db.Conn, staff_id: Any, rules: dict[str, Any], reason: str | None = None) -> int:
    """→ the new version. Refuses anyone who does not hold the capability, and a rule set that cannot work, changing nothing."""
    if not may_set(conn, staff_id):
        raise PermissionError("only the co-founders may change the money rules")
    if bad := problems(rules):
        raise ValueError("; ".join(bad))
    settings.lock(conn, KEY)
    before = current(conn)
    settings.put(conn, KEY, rules)
    tenant = db.one(conn, "select id from tenant where slug = %s", (db.tenant_slug(),))["id"]
    kept.keep(conn, tenant, ("config", KEY, "set"), before, rules, f"staff:{staff_id}", reason, staff_id)
    return version(conn)


def category_problems(wanted: list[str]) -> list[str]:
    """Why a list of categories will not do, in words: none, a blank one, one too long to show whole, or one listed twice."""
    names = [c.strip() for c in wanted]
    out = [] if names else ["the school needs at least one category"]
    if "" in names:
        out.append("a category needs a name")
    if any(len(c) > CATEGORY_MOST for c in names):
        out.append(f"a category name may have at most {CATEGORY_MOST} letters")
    twice = sorted({c for c in names if c and [x.casefold() for x in names].count(c.casefold()) > 1})
    if twice:
        out.append(f"these categories are listed twice: {', '.join(twice)}")
    return out


def categories(conn: db.Conn) -> list[str]:
    return settings.config(conn, CATEGORIES, [])


def set_categories(conn: db.Conn, staff_id: Any, names: list[str], reason: str | None = None) -> None:
    """What a claim can be for, changed by someone who may set the rules and kept in change_log as a change of the rules is. Refuses, changing
    nothing, an empty list, a blank or too long name and a name listed twice."""
    if not may_set(conn, staff_id):
        raise PermissionError("only the co-founders may change the money rules")
    if bad := category_problems(names):
        raise ValueError("; ".join(bad))
    settings.lock(conn, CATEGORIES)
    before, after = categories(conn), [c.strip() for c in names]
    settings.put(conn, CATEGORIES, after)
    tenant = db.one(conn, "select id from tenant where slug = %s", (db.tenant_slug(),))["id"]
    kept.keep(
        conn,
        tenant,
        ("config", CATEGORIES, "set"),
        {"categories": before},
        {"categories": after},
        f"staff:{staff_id}",
        reason,
        staff_id,
    )


def save(
    conn: db.Conn, staff_id: Any, rules: dict[str, Any], names: list[str], reason: str | None = None
) -> int:
    """The Rules screen's one save: the rules and the categories together, each kept only if it changed. → the version. Refuses, changing
    nothing, anyone who may not set the rules and anything that cannot work, the rules' words and the categories' together."""
    if not may_set(conn, staff_id):
        raise PermissionError("only the co-founders may change the money rules")
    if bad := problems(rules) + category_problems(names):
        raise ValueError("; ".join(bad))
    reason = (reason or "").strip() or None
    if rules != current(conn):
        set_rules(conn, staff_id, rules, reason)
    if [c.strip() for c in names] != categories(conn):
        set_categories(conn, staff_id, names, reason)
    return version(conn)


def history(conn: db.Conn, actor: str, most: int = 50) -> list[dict[str, Any]]:
    """Every change to the rules or the categories, newest first, in words: {version, on, by (first name), reason, changes}. `version` is the
    rules' version the change made (a change of categories makes none: the version then in force). `actor` is who asks, kept by the names read."""
    rows = conn.execute(
        "select row_id, before, after, staff_id, reason, at from change_log where table_name = 'config' and op = 'set'"
        " and row_id in (%s, %s) order by at, id",
        (KEY, CATEGORIES),
    ).fetchall()
    firsts: dict[Any, str] = {}
    out: list[dict[str, Any]] = []
    n = 1
    for r in rows:
        if r["row_id"] == KEY:
            n += 1
            said = words.describe(r["before"], r["after"])
        else:
            said = words.describe_categories(r["before"]["categories"], r["after"]["categories"])
        who = r["staff_id"]
        if who not in firsts:
            firsts[who] = money_names.first_name(conn, who, actor) if who else "Someone"
        out.append(
            {
                "version": n,
                "on": str(settings.school_day(conn, r["at"])),
                "by": firsts[who],
                "reason": r["reason"],
                "changes": said or ["saved the rules without changing anything"],
            }
        )
    return out[::-1][:most]
