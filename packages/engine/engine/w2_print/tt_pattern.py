"""CP-71: the timetable's two-week pattern as a coordinator builds it (specs/CP-71/spec.md, design F3).

The pattern is the class's `frame` rules of `timetable_rule`: a cell is one period on one weekday of week A or B, from a date. This file
reads it as of a date and holds the one write door, `change`: a batch of cell changes written all or none, dated from a day, that
returns its own inverse. A change ends the cell that was open the day before and opens a new one, so the pattern as of any earlier
date reads as it did and no lesson is touched (a lesson is written only by publishing). The bulk tools (start from another class, fill a
period, copy a week) are in `tt_pattern_copy`; the coordinators' check is `guard`. No model, no name."""

import datetime as dt
import hashlib
from dataclasses import dataclass
from typing import Any

from engine.core import db, history, settings
from engine.w2_print import fortnight_cycle as fc
from engine.w2_print import tt_heads, tt_live, tt_live_plan
from engine.w2_print.tt_rules import Refused, klass

CELLS = ("fixed", "subject", "specialist")
WEEKS = ("A", "B")
DAY = dt.timedelta(days=1)


@dataclass
class Edit:
    """One cell change: `set` puts a cell there, `clear` leaves it empty. `source` is who made it (`person` pins it for the solver)."""

    period_id: str
    week: str
    weekday: int
    op: str = "set"
    cell: str | None = None
    subject_code: str | None = None
    text: str | None = None
    source: str = "person"

    @property
    def slot(self) -> tuple[str, str, int]:
        return (self.period_id, self.week, self.weekday)

    def out(self) -> dict:
        return {k: v for k, v in self.__dict__.items() if v is not None}


def edits_of(raw: list[Any]) -> list[Edit]:
    return [e if isinstance(e, Edit) else Edit(**e) for e in raw]


def _hm(t: dt.time | None) -> str | None:
    return t.strftime("%H:%M") if t else None


def guard(conn: db.Conn, staff: Any, tenant: Any, today: dt.date) -> None:
    """Only the coordinators' group (`timetable.go_live_group`) writes the pattern; anyone on the staff list reads it."""
    try:
        tt_live.in_group(conn, tenant, staff, today, what="change the timetable pattern")
    except tt_live_plan.Refused as no:
        raise Refused(str(no), 403) from no


def periods_at(conn: db.Conn, grade: str, on: dt.date) -> list[dict]:
    """The day shape of a grade on a date: its periods whose dates include it, in time order (a layout past its last day is not offered)."""
    return [
        {"id": r["id"], "ord": r["ord"], "label": r["label"], "starts_at": _hm(r["starts_at"]), "ends_at": _hm(r["ends_at"]), "fixed": r["fixed"]}
        for r in conn.execute(
            "select id::text as id, ord, label, starts_at, ends_at, fixed from period where grade_code = %s"
            " and (valid_from is null or valid_from <= %s) and (valid_to is null or valid_to >= %s) order by starts_at",
            (grade, on, on),
        ).fetchall()
    ]  # fmt: skip


def _open(conn: db.Conn, class_id: Any, on: dt.date) -> dict[tuple[str, str, int], dict]:
    return {
        (r["period_id"], r["week_code"], r["weekday"]): r
        for r in conn.execute(
            "select id::text as id, period_id::text as period_id, week_code, weekday, cell, subject_code, text, source,"
            " valid_from, valid_to from timetable_rule where school_class_id = %s and kind = 'frame'"
            " and valid_from <= %s and (valid_to is null or valid_to >= %s)",
            (class_id, on, on),
        ).fetchall()
    }


def read(conn: db.Conn, class_id: Any, on: dt.date) -> dict:
    """The class's pattern on a date: the day shape and every place in it (period x week x weekday), a place with nothing `empty`."""
    k = klass(conn, str(class_id), [_class(conn, class_id)])
    periods = periods_at(conn, k["grade"], on)
    held = _open(conn, k["id"], on)
    cells = []
    for p in periods:
        for wk in WEEKS:
            for wd in range(1, 6):
                r = held.get((p["id"], wk, wd))
                shown = r if r and r["cell"] != "empty" else None
                cells.append({
                    "period_id": p["id"], "week": wk, "weekday": wd, "cell": shown["cell"] if shown else "empty",
                    "subject_code": shown["subject_code"] if shown else None, "text": shown["text"] if shown else "",
                    "source": shown["source"] if shown else None,
                })  # fmt: skip
    return {
        "class": k,
        "as_of": on.isoformat(),
        "version": version(conn, k["id"]),
        "periods": periods,
        "cells": cells,
    }


def version(conn: db.Conn, class_id: Any) -> str:
    """A short stamp of the class's whole pattern (every frame row, every date): it changes whenever any cell does, so a write that carries
    the stamp it was made on is refused when somebody else has written since (design F8, two coordinators on one class)."""
    rows = conn.execute(
        "select id::text as id, period_id::text as p, week_code, weekday, cell, subject_code, text, source, valid_from, valid_to"
        " from timetable_rule where school_class_id = %s and kind = 'frame' order by id",
        (class_id,),
    ).fetchall()
    return hashlib.sha256(repr([tuple(r.values()) for r in rows]).encode()).hexdigest()[:16]


def _class(conn: db.Conn, class_id: Any) -> dict:
    found = conn.execute(
        "select id::text as id, grade_code as grade, section, tenant_id, academic_year_id from school_class where id = %s",
        (class_id,),
    ).fetchone()
    if found is None:
        raise Refused("That class is not there.", 404)
    return found


def next_unpublished(conn: db.Conn, class_id: Any, today: dt.date) -> dt.date:
    """The first day a pattern change should reach by default: the start of the class's first teaching fortnight, not yet over,
    that has no lessons for it (else today)."""
    row = conn.execute(
        "select f.starts_on from fortnight f join school_class c on c.academic_year_id = f.academic_year_id where c.id = %s"
        " and f.kind = 'teaching' and f.ends_on >= %s and not exists (select 1 from session s join school_day d"
        " on d.id = s.school_day_id where s.school_class_id = c.id and d.on_date between f.starts_on and f.ends_on)"
        " order by f.starts_on limit 1",
        (class_id, today),
    ).fetchone()
    return row["starts_on"] if row else today


def _check(conn: db.Conn, k: dict, e: Edit, on: dt.date, held: dict, listed: list[dict]) -> Edit:
    """One edit, made whole or refused in words: its place exists, a fixed cell is not painted over, a cell has what it needs."""
    if e.period_id not in {p["id"] for p in periods_at(conn, k["grade"], on)}:
        raise Refused("That period is not one of this class's periods on that date.")
    if e.week not in WEEKS or not isinstance(e.weekday, int) or not 1 <= e.weekday <= 5:
        raise Refused("A place is week A or B and a weekday, Monday (1) to Friday (5).")
    if e.op not in ("set", "clear") or e.source not in ("machine", "person"):
        raise Refused("An edit sets a cell or clears it.")
    now = held.get(e.slot)
    if now and now["cell"] == "fixed" and not (e.op == "set" and e.cell == "fixed"):
        raise Refused(
            f"{now['text']} is fixed there: a fixed row is changed in the day's rules, not painted over."
        )
    if e.op == "clear":
        return e
    if e.cell not in CELLS:
        raise Refused("A cell is fixed, a subject or a specialist's.")
    text = (e.text or "").strip()
    if e.cell == "fixed":
        if not text:
            raise Refused("Say what is fixed there.")
        return Edit(**{**e.__dict__, "subject_code": None, "text": text})
    if e.subject_code not in {h["code"] for h in listed}:
        raise Refused("That subject is not one the school lists.")
    return Edit(**{**e.__dict__, "text": text or tt_heads.label_of(listed, e.subject_code)})


def _state(row: dict | None) -> Edit | None:
    """What an open row says, as the edit that would put it back."""
    if row is None or row["cell"] == "empty":
        return None
    return Edit(
        row["period_id"],
        row["week_code"],
        row["weekday"],
        "set",
        row["cell"],
        row["subject_code"],
        row["text"],
        row["source"],
    )


def _put(conn: db.Conn, k: dict, e: Edit, on: dt.date) -> Edit:
    """Write one checked edit as of `on`; returns the edit that undoes it."""
    old = conn.execute(
        "select id::text as id, period_id::text as period_id, week_code, weekday, cell, subject_code, text, source, valid_from, valid_to"
        " from timetable_rule where school_class_id = %s and kind = 'frame' and period_id::text = %s and week_code = %s and weekday = %s"
        " and valid_from <= %s and (valid_to is null or valid_to >= %s)",
        (k["id"], *e.slot, on, on),
    ).fetchone()  # fmt: skip
    before = _state(old)
    want = None if e.op == "clear" else e
    undo = before.out() if before else Edit(*e.slot, "clear").out()
    if (before is None and want is None) or (
        before
        and want
        and (before.cell, before.subject_code, before.text, before.source)
        == (want.cell, want.subject_code, want.text, want.source)
    ):
        return Edit(**undo)
    ends = old["valid_to"] if old else None
    if old:
        if old["valid_from"] >= on:
            conn.execute("delete from timetable_rule where id::text = %s", (old["id"],))
        else:
            conn.execute("update timetable_rule set valid_to = %s where id::text = %s", (on - DAY, old["id"]))
    elif want:  # a gap: the new cell runs to the day before the next one starts
        nxt = db.one(
            conn,
            "select min(valid_from) as d from timetable_rule where school_class_id = %s and kind = 'frame' and period_id::text = %s"
            " and week_code = %s and weekday = %s and valid_from > %s",
            (k["id"], *e.slot, on),
        )["d"]
        ends = nxt - DAY if nxt else None
    if want:
        prior = conn.execute(
            "select id::text as id, cell, subject_code, text, source from timetable_rule where school_class_id = %s and kind = 'frame'"
            " and period_id::text = %s and week_code = %s and weekday = %s and valid_to = %s",
            (k["id"], *e.slot, on - DAY),
        ).fetchone()  # fmt: skip
        if prior and (prior["cell"], prior["subject_code"], prior["text"], prior["source"]) == (
            want.cell,
            want.subject_code,
            want.text,
            want.source,
        ):
            conn.execute(
                "update timetable_rule set valid_to = %s where id::text = %s", (ends, prior["id"])
            )  # the same cell goes on
        else:
            conn.execute(
                "insert into timetable_rule (tenant_id, school_class_id, kind, period_id, week_code, weekday, cell, subject_code, text,"
                " valid_from, valid_to, source) values (%s, %s, 'frame', %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                (k["tenant_id"], k["id"], *e.slot[:1], e.week, e.weekday, want.cell, want.subject_code, want.text, on, ends, want.source),
            )  # fmt: skip
    return Edit(**undo)


def apply(
    conn: db.Conn,
    staff: Any,
    class_id: Any,
    raw: list[Any],
    on: dt.date,
    *,
    today: dt.date,
    reason: str | None = None,
    version_seen: str | None = None,
) -> list[dict]:
    """The write inside a transaction the caller holds: every edit checked against the pattern as the batch has left it, then written,
    kept in the history with who made it. Returns the inverse, last edit first. Any refusal leaves nothing written."""
    k = _class(conn, class_id)
    guard(conn, staff, k["tenant_id"], today)
    conn.execute(
        "select pg_advisory_xact_lock(hashtext(%s), hashtext(%s))", (str(k["tenant_id"]), k["id"])
    )  # one writer at a time
    if version_seen is not None and version_seen != version(conn, k["id"]):
        raise Refused(
            "The pattern has changed since you opened it (somebody else saved a change). Look at it again, then make your change.",
            409,
        )
    listed = tt_heads.heads(conn)
    try:
        fc.ensure_editable(
            conn, fc.fortnights_touched(conn, k["academic_year_id"], from_day=on), reason=reason, table="timetable_rule",
            record_id=f"{k['id']} pattern", op="update", actor=staff,
        )  # fmt: skip
    except fc.CycleError as no:
        raise Refused(str(no), 409) from no
    history.by(conn, f"staff:{staff}")
    undone: list[Edit] = []
    for e in edits_of(raw):
        e = _check(conn, k, e, on, _open(conn, k["id"], on), listed)
        undone.append(_put(conn, k, e, on))
    return [u.out() for u in reversed(undone)]


def change(
    conn: db.Conn,
    staff: Any,
    class_id: Any,
    raw: list[Any],
    on: dt.date,
    *,
    today: dt.date,
    reason: str | None = None,
    version: str | None = None,
) -> dict:
    """A batch of cell changes dated from `on`, written all or none; the new pattern as of `on` and the inverse (the Undo). `version` is the
    stamp of the pattern the person was looking at: when it is not the current one nothing is written (409)."""
    with conn.transaction():
        inverse = apply(conn, staff, class_id, raw, on, today=today, reason=reason, version_seen=version)
    return {"pattern": read(conn, class_id, on), "inverse": inverse}


def default_from(conn: db.Conn, class_id: Any) -> dt.date:
    return next_unpublished(conn, class_id, settings.school_today(conn))
