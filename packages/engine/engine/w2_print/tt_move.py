"""CP-12: a lesson moved by hand inside one fortnight (specs/CP-12/design.md, decisions 1, 2, 5 and 6).

A lesson is one dated cell of the fortnight's own layer (CP-22's dated `timetable_slot` rows); a fortnight no draft put
live gets its layer copied from the standing frame on its first move (`timetable_fortnight_layer`). A move swaps what two
cells hold, so moving onto an empty cell and swapping two lessons are one operation; the two dated lessons (`session`)
follow, updated in place so their plan lines and materials links stay with them. Every check runs before any write; a
refusal names its reason and writes nothing. CP-6's freeze (`fortnight_cycle.ensure_editable`) asks for a reason past
planning. Each move is kept in `timetable_move`. Code decides everything; no model, no name."""

import datetime as dt
from dataclasses import dataclass
from typing import Any

from engine.core import db
from engine.w2_print import educator_gate as gate
from engine.w2_print import fortnight_cycle as fc
from engine.w2_print import tt_clash
from engine.w2_print.tt_clash import Refused
from engine.w2_print.tt_live_plan import Plan, _materials

SETTLED = ("approved", "list_sent")  # cycle states in which a move may not leave a clash nobody accepted


@dataclass
class Place:
    date: dt.date
    period: dict  # the period row: id, label, fixed
    day_id: Any  # school_day.id
    slot: dict | None = None  # the layer row, once the layer exists
    session: dict | None = None


def _class(conn: db.Conn, grade: str, section: str, year: str) -> dict:
    k = conn.execute(
        "select c.id, c.tenant_id, c.campus_id, c.academic_year_id from school_class c"
        " join academic_year y on y.id = c.academic_year_id where c.grade_code = %s and c.section = %s and y.label = %s",
        (grade, section, year),
    ).fetchone()
    if k is None:
        raise Refused(f"no class {grade} {section} {year} on this database.")
    return k


def _fortnight(conn: db.Conn, k: dict, on: dt.date) -> dict:
    f = conn.execute(
        "select f.id, f.number, f.starts_on, f.ends_on from fortnight f where f.academic_year_id = %s"
        " and f.kind = 'teaching' and %s between f.starts_on and f.ends_on",
        (k["academic_year_id"], on),
    ).fetchone()
    if f is None:
        raise Refused(f"{on} is not in a teaching fortnight of this year.")
    return f


def _place(conn: db.Conn, k: dict, grade: str, on: dt.date, ord_: int, today: dt.date) -> Place:
    if on < today:
        raise Refused(f"{on} is already past; a lesson on a day gone by is not moved.")
    periods = conn.execute(
        "select id, label, fixed from period where tenant_id = %s and grade_code = %s and ord = %s",
        (k["tenant_id"], grade, ord_),
    ).fetchall()
    if len(periods) != 1:
        raise Refused(f"there is no one period {ord_} in the {grade} day.")
    day = conn.execute(
        "select id, kind from school_day where campus_id = %s and on_date = %s", (k["campus_id"], on)
    ).fetchone()
    if day is None:
        raise Refused(f"{on} has no school day on record; add it to the calendar first.")
    if day["kind"] == "holiday":
        raise Refused(f"{on} is a holiday; nothing is taught or moved there.")
    if periods[0]["fixed"]:
        raise Refused(f"{periods[0]['label']} is a fixed period; it is not moved.")
    return Place(on, periods[0], day["id"])


def _fill(conn: db.Conn, k: dict, f: dict, p: Place) -> None:
    """The cell's layer row and its dated lesson, once the layer exists; refusals that depend on them."""
    p.slot = conn.execute(
        "select id, kind, subject_code, text from timetable_slot where school_class_id = %s and fortnight_id = %s"
        " and valid_from = %s and period_id = %s",
        (k["id"], f["id"], p.date, p.period["id"]),
    ).fetchone()
    if p.slot is None:
        raise Refused(f"the timetable has no cell on {p.date} for {p.period['label']}.")
    if p.slot["kind"] == "fixed":
        raise Refused(
            f"{p.slot['text'] or p.period['label']} on {p.date} is a fixed lesson; it is not moved."
        )
    p.session = conn.execute(
        "select * from session where school_class_id = %s and school_day_id = %s and period_id = %s",
        (k["id"], p.day_id, p.period["id"]),
    ).fetchone()
    if p.session is not None and (p.session["state"] != "planned" or not p.session["planned"]):
        raise Refused(
            f"the lesson on {p.date} ({p.period['label']}) is already marked {p.session['state'].replace('_', ' ')};"
            " only a planned lesson is moved."
        )


def _materials_stay_valid(conn: db.Conn, a: Place, b: Place) -> None:
    """CP-22's own check (`tt_live_plan._materials`): a lesson whose materials list was already sent, or whose new date
    falls outside its list's dates, is not moved. Refused, naming the lesson, before anything is written."""
    plan = Plan()
    for s, to in ((a.session, b), (b.session, a)):
        if s:
            here = {
                **s,
                "on_date": (a if s is a.session else b).date,
                "period_id": str(s["period_id"]),
                "line": None,
            }
            plan.moves.append((here, (to.date, str(to.period["id"]))))
    _materials(conn, plan, {})
    if plan.stops:
        raise Refused("the move stops:\n  " + "\n  ".join(plan.stops))


def _swap(conn: db.Conn, a: Place, b: Place) -> None:
    """Exchange what the two cells hold. The cells (date, period) stay, so no key is touched and the layer rows' ids
    stay put. The dated lessons travel with their id (their materials lines point at it): two lessons swap places by
    being taken out together and put back (the session key is immediate, as CP-22's `tt_live._write` found); one
    lesson moves into the free place by an update. Materials links and lines follow to the new date."""
    for mine, theirs in ((a.slot, b.slot), (b.slot, a.slot)):
        assert mine is not None and theirs is not None
        conn.execute(
            "update timetable_slot set kind = %s, subject_code = %s, text = %s where id = %s",
            (theirs["kind"], theirs["subject_code"], theirs["text"], mine["id"]),
        )
    going = [(s, to) for s, to in ((a.session, b), (b.session, a)) if s]
    if not going:
        return
    ids = [s["id"] for s, _ in going]
    links = conn.execute(
        "select line_id, session_id, activity_code, quantity from materials_line_source where session_id = any(%s)",
        (ids,),
    ).fetchall()
    conn.execute(
        "delete from materials_line_source where session_id = any(%s)", (ids,)
    )  # it has no updated_at
    if len(going) == 1:
        s, to = going[0]
        conn.execute(
            "update session set school_day_id = %s, period_id = %s where id = %s",
            (to.day_id, to.period["id"], s["id"]),
        )
    else:
        conn.execute("delete from session where id = any(%s)", (ids,))
        for s, to in going:
            conn.execute(
                "insert into session (id, tenant_id, school_class_id, school_day_id, period_id, subject_code,"
                " led_by_staff_id, state, planned, plan_entry_id, text, created_at)"
                " values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                (s["id"], s["tenant_id"], s["school_class_id"], to.day_id, to.period["id"], s["subject_code"],
                 s["led_by_staff_id"], s["state"], s["planned"], s["plan_entry_id"], s["text"], s["created_at"]),
            )  # fmt: skip
    day_of = {s["id"]: to.date for s, to in going}
    for r in links:
        conn.execute(
            "insert into materials_line_source (line_id, session_id, activity_code, on_date, quantity)"
            " values (%s, %s, %s, %s, %s)",
            (r["line_id"], r["session_id"], r["activity_code"], day_of[r["session_id"]], r["quantity"]),
        )
    for r in (
        links
    ):  # a line shared with another lesson keeps its date: only a line this lesson alone feeds follows it
        conn.execute(
            "update materials_line set needed_on = %s where id = %s and not exists"
            " (select 1 from materials_line_source where line_id = %s and session_id <> %s)",
            (day_of[r["session_id"]], r["line_id"], r["line_id"], r["session_id"]),
        )


def move(
    conn: db.Conn, grade: str, section: str, year: str, frm: dt.date, from_ord: int, to: dt.date, to_ord: int,
    *, who: Any, reason: str | None = None,
) -> dict:  # fmt: skip
    """Move the lesson at (`frm`, period `from_ord`) to (`to`, period `to_ord`) in the same fortnight, as `who` (a staff
    id); a lesson already there swaps places with it. Raises `Refused` (nothing written) when a check fails."""
    k = _class(conn, grade, section, year)
    conn.execute(
        "select pg_advisory_xact_lock(hashtext(%s), hashtext(%s))", (str(k["tenant_id"]), str(k["id"]))
    )
    today = gate.school_today(conn)
    if (frm, from_ord) == (to, to_ord):
        raise Refused("from and to are the same place.")
    f = _fortnight(conn, k, frm)
    if not f["starts_on"] <= to <= f["ends_on"]:
        raise Refused(f"{to} is in another fortnight; a move stays inside fortnight {f['number']}.")
    a, b = _place(conn, k, grade, frm, from_ord, today), _place(conn, k, grade, to, to_ord, today)
    with conn.transaction():  # a refusal at any point takes back the layer, the freeze record and every write
        fc.ensure_editable(
            conn,
            [f["id"]],
            reason=reason,
            table="timetable_slot",
            record_id=str(k["id"]),
            op="update",
            actor=who,
        )
        conn.execute("select public.timetable_fortnight_layer(%s, %s)", (k["id"], f["id"]))
        _fill(conn, k, f, a)
        _fill(conn, k, f, b)
        assert a.slot is not None
        moved = dict(a.slot)
        _materials_stay_valid(conn, a, b)
        _swap(conn, a, b)
        state = conn.execute(
            "select state from fortnight_cycle where fortnight_id = %s", (f["id"],)
        ).fetchone()
        if state and state["state"] in SETTLED and tt_clash.blocks_approval(conn, k["tenant_id"]):
            open_ = tt_clash.open_by_kind(conn, f["id"])
            if open_:
                raise Refused(
                    f"fortnight {f['number']} is {state['state']} and this move would leave {tt_clash.words(open_)}."
                )
        conn.execute(
            "insert into timetable_move (tenant_id, school_class_id, fortnight_id, from_date, from_period, to_date,"
            " to_period, moved_kind, moved_subject, reason, who) values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
            (k["tenant_id"], k["id"], f["id"], frm, a.period["id"], to, b.period["id"], moved["kind"],
             moved["subject_code"], (reason or "").strip() or None, who),
        )  # fmt: skip
    return {
        "fortnight": f["number"], "moved": moved["subject_code"] or moved["kind"], "from": f"{frm} {a.period['label']}",
        "to": f"{to} {b.period['label']}", "swapped_with": (b.slot or {}).get("subject_code") if b.slot and b.slot["kind"] != "empty" else None,
    }  # fmt: skip
