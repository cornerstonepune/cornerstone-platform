"""CP-22: what going live does to the fortnight's sessions, worked out before any write (specs/CP-22/design.md).
The fortnight's subject lessons (`session.kind`), per subject and week in plan order, are matched to the draft's lessons
of that subject and week in date order. Reads only; `tt_live` writes. No model, no name."""

import datetime as dt
from dataclasses import dataclass, field
from typing import Any

from engine.core import db
from engine.w2_print import tt_need as need

Cell = tuple[dt.date, str]  # a date and a period id


class Refused(Exception):
    """A check failed: the reason and, where there is one, the list of lessons. Nothing was written."""

    def __init__(self, why: str, named: list[str] | None = None):
        super().__init__(why)
        self.why, self.named = why, list(named or [])

    def __str__(self) -> str:
        return "\n".join([self.why, *(f"  {n}" for n in self.named)])


@dataclass
class Plan:
    """What going live does to the fortnight's sessions, worked out before any write."""

    moves: list[tuple[dict, Cell]] = field(default_factory=list)  # a session and the cell it goes to
    removed: list[dict] = field(default_factory=list)  # sessions with no lesson and no materials link
    materials: list[tuple[Any, Any, dt.date]] = field(default_factory=list)  # (line, session, new date)
    stops: list[str] = field(default_factory=list)


# ---- the sessions -----------------------------------------------------------------------------------------------------


def _sessions(conn: db.Conn, i: need.Inputs, fn: dict) -> list[dict]:
    return conn.execute(
        "select s.id, s.subject_code, s.kind, s.state, s.planned, s.period_id::text as period_id, s.text, d.on_date,"
        " pe.ord, pe.week_code, pe.text as line,"
        " exists (select 1 from materials_line_source m where m.session_id = s.id) as linked"
        " from session s join school_day d on d.id = s.school_day_id"
        " left join plan_entry pe on pe.id = s.plan_entry_id"
        " where s.school_class_id = %s and d.on_date between %s and %s",
        (i.class_id, fn["starts_on"], fn["ends_on"]),
    ).fetchall()


def _say(s: dict, start: dict[str, str], why: str) -> str:
    return f"{s['on_date']} {start.get(s['period_id'], '')} {s['subject_code'] or ''} ({s['line'] or s['text']}): {why}"


def _sorted_out(
    conn: db.Conn, i: need.Inputs, fn: dict, lesson_at: dict[Cell, str], plan: Plan, start: dict[str, str]
):
    """The fortnight's sessions in three heaps: the cells that stay as they are (circle, lunch, a visiting teacher),
    the cells a marked session keeps, and the planned subject sessions that may move, by (subject, week)."""
    week = {d.date: d.week for d in i.days}
    pool: dict[tuple[str, str], list[dict]] = {}
    pinned: set[Cell] = set()
    occupied: set[Cell] = set()
    for s in _sessions(conn, i, fn):
        cell: Cell = (s["on_date"], s["period_id"])
        marked = s["state"] != "planned" or not s["planned"]
        if s["kind"] != "subject":  # a fixed lesson, a specialist's: it stays where it is
            occupied.add(cell)
        elif marked and lesson_at.get(cell) == s["subject_code"]:
            pinned.add(cell)  # already marked, and the draft keeps it: not moved, not matched
        elif marked:
            plan.stops.append(_say(s, start, "already marked, and the draft changes this lesson"))
        else:
            pool.setdefault((s["subject_code"], s["week_code"] or week[cell[0]]), []).append(s)
    return pool, pinned, occupied


def plan(conn: db.Conn, i: need.Inputs, fn: dict, draft: list[dict]) -> Plan:
    """Sessions on the frame's subject cells, per subject and week in plan order, matched to the draft's lessons of
    that subject and week in date order. A session the draft keeps in its cell stays whatever its state; one already
    marked whose cell the draft changes, one with materials left with no lesson, or one whose materials list is sent
    or does not cover its new date, stops the whole step."""
    week = {d.date: d.week for d in i.days}
    order = {p["id"]: n for n, p in enumerate(i.periods)}
    start = {p["id"]: p["starts_at"] for p in i.periods}
    lesson_at: dict[Cell, str] = {
        (dt.date.fromisoformat(e["date"]), str(e["period_id"])): e["subject_code"] for e in draft
    }
    plan = Plan()
    pool, pinned, occupied = _sorted_out(conn, i, fn, lesson_at, plan, start)
    lessons: dict[tuple[str, str], list[Cell]] = {}
    for cell, subject in lesson_at.items():
        if cell not in pinned:
            lessons.setdefault((subject, week[cell[0]]), []).append(cell)
    for key, sessions in sorted(pool.items()):
        sessions.sort(
            key=lambda s: (s["ord"] is None, s["ord"] or 0, s["on_date"], order.get(s["period_id"], 99))
        )
        cells = sorted(lessons.get(key, []), key=lambda c: (c[0], order.get(c[1], 99)))
        _match(plan, sessions, cells, occupied, start)
    _materials(conn, plan, start)
    if plan.stops:
        raise Refused(
            f"the step stops: {len(plan.stops)} lessons cannot be placed as the draft says:", plan.stops
        )
    return plan


def _match(
    plan: Plan, sessions: list[dict], cells: list[Cell], occupied: set[Cell], start: dict[str, str]
) -> None:
    for s, cell in zip(sessions, cells):
        if cell in occupied:
            plan.stops.append(_say(s, start, f"its place on {cell[0]} is taken by a lesson that stays"))
        elif cell != (s["on_date"], s["period_id"]):
            plan.moves.append((s, cell))
    for s in sessions[len(cells) :]:
        if s["linked"]:
            plan.stops.append(_say(s, start, "left with no place, and it has materials"))
        else:
            plan.removed.append(s)


def _materials(conn: db.Conn, plan: Plan, start: dict[str, str]) -> None:
    """A moved session's materials lines move with it, if the list is not sent and still covers the new date."""
    dated = {str(s["id"]): (s, cell[0]) for s, cell in plan.moves if cell[0] != s["on_date"]}
    if not dated:
        return
    for r in conn.execute(
        "select m.line_id, m.session_id::text as sid, ml.state, ml.from_on, ml.to_on from materials_line_source m"
        " join materials_line l on l.id = m.line_id join materials_list ml on ml.id = l.list_id"
        " where m.session_id::text = any(%s)",
        (list(dated),),
    ).fetchall():
        s, new = dated[r["sid"]]
        if r["state"] == "sent":
            plan.stops.append(_say(s, start, "its materials list was already sent"))
        elif not r["from_on"] <= new <= r["to_on"]:
            plan.stops.append(
                _say(
                    s,
                    start,
                    f"would move to {new}, outside its materials list ({r['from_on']} to {r['to_on']})",
                )
            )
        else:
            plan.materials.append((r["line_id"], s["id"], new))
