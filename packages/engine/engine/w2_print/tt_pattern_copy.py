"""CP-71: the pattern's bulk tools, each a list of cell changes handed to the one door (`tt_pattern.apply`), so each is dated, written
all or none, kept in the history and returns its inverse.

- `start_from`: a class with no day takes another class's periods and fixed rows, nothing else (the one tool that makes fixed cells).
- `fill_period`: one cell's words in a period on every weekday of week A, week B or both (a person's choice: `person`).
- `copy_week`, `copy_day`: cells from one place to others; the copy is `machine`-made.
A fixed cell is never replaced, and a copy never moves one: it is skipped and said. No model, no name."""

import datetime as dt
from typing import Any

from engine.core import db
from engine.w2_print import tt_pattern as pat
from engine.w2_print.tt_pattern import Edit, Refused


def _result(conn: db.Conn, class_id: Any, on: dt.date, inverse: list[dict], skipped: list[dict]) -> dict:
    return {"pattern": pat.read(conn, class_id, on), "inverse": inverse, "skipped": skipped}


def start_from(
    conn: db.Conn, staff: Any, to_class: Any, from_class: Any, on: dt.date, *, today: dt.date
) -> dict:
    """Give a class with no day shape the day shape and the fixed rows of another class: its periods are made for the class's grade
    and every fixed cell of the other class's pattern on `on` is set on the same period, both weeks, all weekdays."""
    with conn.transaction():
        to, src = pat._class(conn, to_class), pat._class(conn, from_class)
        pat.guard(conn, staff, to["tenant_id"], today)
        if to["id"] == src["id"]:
            raise Refused("A class cannot start from itself.")
        if pat.periods_at(conn, to["grade"], on):
            raise Refused(
                f"{to['grade']} already has a day (its periods); change it there instead of starting again."
            )
        theirs = pat.periods_at(conn, src["grade"], on)
        if not theirs:
            raise Refused("The class to start from has no day to copy.")
        made = {}
        for p in theirs:
            row = db.one(
                conn,
                "insert into period (tenant_id, grade_code, ord, starts_at, ends_at, label, fixed) select tenant_id, %s, ord, starts_at,"
                " ends_at, label, fixed from period where id::text = %s returning id::text as id",
                (to["grade"], p["id"]),
            )
            made[p["id"]] = row["id"]
        edits = [
            Edit(made[c["period_id"]], c["week"], c["weekday"], "set", "fixed", None, c["text"], "machine")
            for c in pat.read(conn, src["id"], on)["cells"]
            if c["cell"] == "fixed"
        ]
        inverse = pat.apply(conn, staff, to["id"], edits, on, today=today)
    return _result(conn, to["id"], on, inverse, [])


def _plan(conn: db.Conn, class_id: Any, on: dt.date, wanted: list[Edit]) -> tuple[list[Edit], list[dict]]:
    """The edits that may be made and the ones skipped because the place holds a fixed cell."""
    held = pat._open(conn, class_id, on)
    keep, skipped = [], []
    for e in wanted:
        if (held.get(e.slot) or {}).get("cell") == "fixed":
            skipped.append({"period_id": e.period_id, "week": e.week, "weekday": e.weekday, "why": "fixed"})
        else:
            keep.append(e)
    return keep, skipped


def _run(
    conn: db.Conn,
    staff: Any,
    class_id: Any,
    wanted: list[Edit],
    on: dt.date,
    today: dt.date,
    reason: str | None,
) -> dict:
    with conn.transaction():
        k = pat._class(conn, class_id)
        pat.guard(conn, staff, k["tenant_id"], today)
        keep, skipped = _plan(conn, k["id"], on, wanted)
        inverse = pat.apply(conn, staff, k["id"], keep, on, today=today, reason=reason)
    return _result(conn, k["id"], on, inverse, skipped)


def fill_period(
    conn: db.Conn, staff: Any, class_id: Any, period_id: str, what: dict, on: dt.date, *, today: dt.date,
    weeks: tuple[str, ...] = pat.WEEKS, reason: str | None = None,
) -> dict:  # fmt: skip
    """`what` ({cell, subject_code, text}) in the period on every weekday of `weeks`; a fixed place is skipped and listed."""
    wanted = [Edit(str(period_id), wk, wd, "set", **what) for wk in weeks for wd in range(1, 6)]
    return _run(conn, staff, class_id, wanted, on, today, reason)


def _copies(conn: db.Conn, class_id: Any, on: dt.date, pairs: list[tuple[tuple, tuple]]) -> list[Edit]:
    """For each (from place, to place): the edit that puts the from place's cell at the to place. A fixed cell is never the source."""
    shown = {(c["period_id"], c["week"], c["weekday"]): c for c in pat.read(conn, class_id, on)["cells"]}
    out = []
    for (pid, wk, wd), (_, tw, td) in pairs:
        c = shown[(pid, wk, wd)]
        if c["cell"] == "fixed":
            continue
        out.append(
            Edit(pid, tw, td, "clear", source="machine")
            if c["cell"] == "empty"
            else Edit(pid, tw, td, "set", c["cell"], c["subject_code"], c["text"], "machine")
        )
    return out


def copy_week(
    conn: db.Conn,
    staff: Any,
    class_id: Any,
    src: str,
    dest: str,
    on: dt.date,
    *,
    today: dt.date,
    reason: str | None = None,
) -> dict:
    """Week `src`'s cells over week `dest`'s, period by period; a fixed cell in either week stays as it is."""
    if src == dest or {src, dest} - set(pat.WEEKS):
        raise Refused("Copy week A to week B, or B to A.")
    periods = [p["id"] for p in pat.periods_at(conn, pat._class(conn, class_id)["grade"], on)]
    pairs = [((p, src, wd), (p, dest, wd)) for p in periods for wd in range(1, 6)]
    return _run(conn, staff, class_id, _copies(conn, class_id, on, pairs), on, today, reason)


def copy_day(
    conn: db.Conn, staff: Any, class_id: Any, week: str, weekday: int, to: list[tuple[str, int]], on: dt.date, *, today: dt.date,
    reason: str | None = None,
) -> dict:  # fmt: skip
    """One day's cells (week `week`, `weekday`) over each day in `to` ((week, weekday) pairs); a fixed cell stays as it is."""
    periods = [p["id"] for p in pat.periods_at(conn, pat._class(conn, class_id)["grade"], on)]
    pairs = [
        ((p, week, weekday), (p, tw, td)) for p in periods for tw, td in to if (tw, td) != (week, weekday)
    ]
    return _run(conn, staff, class_id, _copies(conn, class_id, on, pairs), on, today, reason)
