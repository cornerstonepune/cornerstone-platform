"""The materials list's reminders (task M1-10; D-070, D-072). The dates are `materials_reminders`'s; this reads the first
day a material is needed, the lead times (setting `materials.reminder_weeks`) and the school's holidays, and gives one
reminder for the educator and one for the materials team at each lead time, worked out whenever asked, never stored.
A list that has been sent has none."""

import datetime as dt
from typing import Any
from uuid import UUID

from engine.core import db, settings
from engine.w2_print import materials_list
from engine.w2_print import materials_reminders as dates

AUDIENCES = ("educator", "team")


def school_today(conn: db.Conn) -> dt.date:
    return db.one(conn, "select (now() at time zone %s)::date as d", (settings.time_zone(conn),))["d"]


def _holidays(conn: db.Conn, tenant: UUID, campus: UUID, lo: dt.date, hi: dt.date) -> set[dt.date]:
    out = {
        r["on_date"]
        for r in conn.execute(
            "select on_date from school_day where tenant_id = %s and campus_id = %s and kind = 'holiday'"
            " and on_date between %s and %s",
            (tenant, campus, lo, hi),
        )
    }
    for f in conn.execute(
        "select starts_on, ends_on from fortnight where tenant_id = %s and kind = 'vacation'"
        " and ends_on >= %s and starts_on <= %s",
        (tenant, lo, hi),
    ):
        out |= {
            f["starts_on"] + dt.timedelta(days=i) for i in range((f["ends_on"] - f["starts_on"]).days + 1)
        }
    return out


def _lists(conn: db.Conn, where: str, params: tuple) -> list[dict[str, Any]]:
    return conn.execute(
        "select l.id, l.tenant_id, l.school_class_id as class_id, c.campus_id, (select min(needed_on)"
        " from materials_line where list_id = l.id and removed_at is null) as first"
        " from materials_list l join school_class c on c.id = l.school_class_id"
        f" where l.state = 'draft' and {where}",  # noqa: S608 (a fixed condition from this module)
        params,
    ).fetchall()


def _due(conn: db.Conn, lst: dict[str, Any], today: dt.date, weeks: list[int]) -> list[dates.Reminder]:
    first = lst["first"]
    if first is None:
        return []
    lo = first - dt.timedelta(weeks=max(weeks, default=0) + 12)
    return dates.reminder_dates(
        first, weeks, today, _holidays(conn, lst["tenant_id"], lst["campus_id"], lo, first)
    )


def reminders(conn: db.Conn, list_id: UUID, today: dt.date) -> list[dict[str, Any]]:
    """The list's reminders on `today`: one for the educator and one for the team at each lead time, worked out from
    its first-needed day, the settings and the holidays whenever they are asked for (CP-27 group 6: once rows of the
    table `reminder`, kept equal to these by hand). A list that was sent, or has no line, has none."""
    weeks = [int(w) for w in settings.config(conn, "materials.reminder_weeks", [2, 1])]
    return [
        {
            "list_id": lst["id"],
            "weeks_before": r.weeks_before,
            "audience": who,
            "due_on": r.due_on,
            "at_once": r.at_once,
        }
        for lst in _lists(conn, "l.id = %s", (list_id,))
        for r in _due(conn, lst, today, weeks)
        for who in AUDIENCES
    ]


def _due_by(conn: db.Conn, today: dt.date, where: str, params: tuple) -> list[tuple[dict, dates.Reminder]]:
    """(list, reminder) for each reminder of the draft lists `where` names that has come due by `today`."""
    weeks = [int(w) for w in settings.config(conn, "materials.reminder_weeks", [2, 1])]
    return [
        (lst, r)
        for lst in _lists(conn, where, params)
        for r in _due(conn, lst, today, weeks)
        if r.due_on <= today
    ]


def inbox(
    conn: db.Conn, today: dt.date, class_id: UUID | None = None, staff: UUID | None = None
) -> list[dict[str, Any]]:
    """What the educator is reminded of today: one message for each unsent list with a reminder due, however many lead
    times are due together. With `staff`, only for classes she holds (`educator.timetable_roles`)."""
    held = None if staff is None else materials_list.held_classes(conn, staff, today)
    by_list: dict[UUID, dict[str, Any]] = {}
    for lst, r in _due_by(
        conn,
        today,
        "(%s::uuid is null or l.school_class_id = %s) and (%s::uuid[] is null or l.school_class_id = any(%s))",
        (class_id, class_id, held, held),
    ):
        one = by_list.setdefault(
            lst["id"],
            {"list_id": lst["id"], "class_id": lst["class_id"], "due_on": r.due_on, "at_once": False,
             "weeks_before": [], "first_needed": lst["first"]},
        )  # fmt: skip
        one["due_on"], one["at_once"] = max(one["due_on"], r.due_on), one["at_once"] or r.at_once
        one["weeks_before"] = sorted([*one["weeks_before"], r.weeks_before], reverse=True)
    return sorted(by_list.values(), key=lambda x: (x["due_on"], str(x["list_id"])))


def due_counts(conn: db.Conn, today: dt.date, tenant: UUID) -> dict[str, int]:
    """How many reminders have come due by `today`. Only counts: it sends and changes nothing."""
    due = _due_by(conn, today, "l.tenant_id = %s", (tenant,))
    return {
        "reminders": len(due) * len(AUDIENCES),
        "lists": len({lst["id"] for lst, _ in due}),
        **{who: len(due) for who in AUDIENCES},
    }
