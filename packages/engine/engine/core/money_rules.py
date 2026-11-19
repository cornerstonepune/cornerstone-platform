"""The money rules the co-founders set (MM-1, D-078): one setting, `money.rules`, and the history of its changes.

Roles are one ladder: each holds everything the roles below it hold. No table: the rules are a `config` row, a change is a
`change_log` row (who, when, before, after), and the version a claim pins is a count of those rows. A claim submitted at version n
is judged by `at_version(n)`, whatever is changed after."""

from typing import Any

from engine.core import db, history, settings

KEY = "money.rules"


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


def problems(rules: dict[str, Any]) -> list[str]:
    """Why a rule set cannot work, in words; empty when it can: a role off the ladder, a kind of claim approved or paid by a role that does
    not hold that capability, an amount no one pays, or a claimant allowed to approve their own claim."""
    out = (
        []
        if rules.get("self_approval") is False
        else ["a claimant may not approve their own claim: self_approval must be false"]
    )
    if not rules.get("ladder"):
        out.append("the ladder of roles is empty")
    for capability in ("submit", "approve", "pay", "set_rules"):
        if rank(rules, rules.get("can", {}).get(capability)) < 0:
            out.append(f"no role on the ladder holds {capability}")
    kinds: dict[str, dict[str, Any]] = rules.get("kinds", {})
    if not kinds:
        out.append("no kind of claim has a route")
    for kind, route in kinds.items():
        if not holds(rules, route.get("approve"), "approve"):
            out.append(f"{kind}: no role that may approve it approves it")
        tiers: list[dict[str, Any]] = route.get("pay") or []
        if not tiers or tiers[-1].get("up_to") is not None:
            out.append(f"{kind}: no one pays above its last pay limit; the last tier must have no ceiling")
        ceilings: list[float] = [t["up_to"] for t in tiers if t.get("up_to") is not None]
        if ceilings != sorted(ceilings):
            out.append(f"{kind}: the pay limits must rise")
        out += [f"{kind}: {t.get('by')} cannot pay" for t in tiers if not holds(rules, t.get("by"), "pay")]
    return out


def may_set(conn: db.Conn, staff_id: Any) -> bool:
    """Whether this member of staff, by the role they have or one they are granted today, holds the capability to set the rules."""
    rules, today = current(conn), settings.school_today(conn)
    mine = conn.execute(
        "select role_code from staff where id = %s union select role_code from staff_role_grant"
        " where staff_id = %s and valid_from <= %s and (valid_to is null or valid_to > %s)",
        (staff_id, staff_id, today, today),
    ).fetchall()
    return any(holds(rules, r["role_code"], "set_rules") for r in mine)


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
    history.keep(conn, tenant, ("config", KEY, "set"), before, rules, f"staff:{staff_id}", reason, staff_id)
    return version(conn)
