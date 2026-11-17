"""A hard ceiling on what one run spends (CP-54): the engine stops, not a person watching. `capped` wraps the asker of a run:
before every call it adds the call's worst-case price to what `flow_run` already records for the skills since the run began,
and refuses (`SpendStop`) the call that would cross the ceiling, so a run never spends past it by even one call. Runs never overlap (the workflow's concurrency group), so
what the skills' total grows by is what the run spent. What a call
costs is the measured rupees of its model where the setting `skill.measured_inr_per_call` has one, else a count of tokens."""

import threading
from typing import Any

from engine.core import db, settings
from engine.skills import machines


class SpendStop(Exception):
    """The next call would cross the run's ceiling: nothing more is asked."""


def price(conn: db.Conn, skill: dict[str, Any], validator: bool, n: int = 1) -> float:
    """What `n` calls of the skill's writer (or validator) cost, in rupees."""
    model = skill["validator_model"] if validator else skill["writer_model"]
    measured = (settings.config(conn, "skill.measured_inr_per_call") or {}).get(model)
    if measured is not None:  # what a call of this model really cost in flow_run beats a count of tokens
        return n * float(measured)
    p = (settings.config(conn, "llm.prices") or {}).get(model, {"in": 0, "out": 0})
    tokens_in = (len(skill["standard"]) + 1500) / 3.5 + 600  # the frame, the standard, the case
    return n * (tokens_in * p["in"] + 400 * p["out"]) / 1_000_000


def _total(conn: db.Conn) -> float:
    row = db.one(conn, "select coalesce(sum(cost_inr), 0) as n from flow_run where flow like 'skill.%%'")
    return float(row["n"])


def started(conn: db.Conn) -> float:
    """What the skills' calls have cost in all, as a run begins: what the run spends is counted from here. (A row's own
    `started_at` is its transaction's start, so a clock would miss calls made in a transaction that began earlier.)"""
    return _total(conn)


def spent(conn: db.Conn, since: float) -> float:
    """Rupees `flow_run` records for the skills' calls since the run began (`since` is `started`'s figure)."""
    return _total(conn) - since


def capped(
    ask: machines.Ask, conn: db.Conn, skills: dict[str, dict[str, Any]], limit: float, since: float
) -> machines.Ask:
    """`ask`, but a call that could take the run past `limit` rupees raises `SpendStop` before it is made."""

    # Calls now run several at once (skills/pool.py), so a call is reserved before it is made: what `flow_run` already holds, plus the
    # worst-case price of every call in flight, plus this one, must stay within the limit. A call's own cost reaches `flow_run`
    # before it returns and its reservation is released after, so for a moment a finished call is counted twice, never not at all.
    lock = threading.Lock()
    reserved = 0.0

    def guarded(purpose: str, variables: dict[str, Any], about: str) -> dict[str, Any]:
        nonlocal reserved
        validator = purpose.endswith(".validate")
        skill = skills[purpose.removeprefix("skill.").removesuffix(".validate")]
        cost = price(conn, skill, validator)
        with lock:
            if spent(conn, since) + reserved + cost > limit:
                raise SpendStop(f"the next call could pass the ceiling of ₹{limit:.0f} ({purpose})")
            reserved += cost
        try:
            return ask(purpose, variables, about)
        finally:
            with lock:
                reserved -= cost

    return guarded
