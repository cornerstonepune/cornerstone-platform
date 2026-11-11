"""CP-28: the coordinator's Today for the school, as whole numbers the website lays out (specs/CP-28/spec.md).

Only reading: nothing here writes and nothing thinks. Every figure is a count taken in SQL from rows the school's
own screens wrote. No child or educator is named, and no figure ranks a person. Who may ask is the one check the
coordinator page uses (`k2_reads.require_coordinator`); the late-notes figure is that page's own count.
"""

import datetime as dt

from engine.core import db, settings
from engine.w3_read import k2_reads

CELLS = ("done", "moved", "not_done", "holiday", "none")


def _weeks(cfg: dict, today: dt.date) -> tuple[dt.date, dt.date]:
    this = today - dt.timedelta(days=(today.weekday() - cfg["week_starts_on"]) % 7)
    return this - dt.timedelta(days=7), this + dt.timedelta(days=7)


def _clashes(conn: db.Conn, campus: str, today: dt.date) -> int:
    return db.one(
        conn,
        "select count(*) as n from timetable_clash t join fortnight f on f.id = t.fortnight_id"
        " where not t.accepted and f.ends_on >= %s and exists (select 1 from jsonb_array_elements(t.places) p"
        " join school_class k on k.id = (p ->> 'class')::uuid where k.campus_id = %s)",
        (today, campus),
    )["n"]


def _drafts(conn: db.Conn, campus: str, today: dt.date) -> list[dict]:
    """One row per class and fortnight not yet started whose newest placed draft nobody put live."""
    return conn.execute(
        "select f.number as fortnight, c.grade_code as grade, c.section from"
        " (select distinct on (school_class_id, fortnight_id) school_class_id, fortnight_id from timetable_run"
        "  where outcome = 'placed' order by school_class_id, fortnight_id, created_at desc, id desc) r"
        " join fortnight f on f.id = r.fortnight_id join school_class c on c.id = r.school_class_id"
        " where c.campus_id = %s and f.starts_on > %s and not exists (select 1 from approval a"
        "  where a.kind = 'timetable_live' and a.target = r.school_class_id::text || ' ' || r.fortnight_id::text)"
        " order by f.number, c.grade_code, c.section",
        (campus, today),
    ).fetchall()


def _no_quantity(conn: db.Conn, campus: str, lo: dt.date, hi: dt.date) -> list[dict]:
    """Live lines needed in the window with no quantity, how many per grade."""
    return conn.execute(
        "select c.grade_code as grade, count(*) as lines from materials_line l"
        " join materials_list m on m.id = l.list_id join school_class c on c.id = m.school_class_id"
        " where c.campus_id = %s and l.removed_at is null and l.quantity is null and l.needed_on between %s and %s"
        " group by c.grade_code order by c.grade_code",
        (campus, lo, hi),
    ).fetchall()


def _last_week(conn: db.Conn, campus: str, lo: dt.date) -> dict:
    cells = conn.execute(
        "select c.grade_code as grade, c.section, d.on_date as day,"
        " case when d.kind = 'holiday' then 'holiday'"
        "  when bool_or(s.planned and s.state in ('planned', 'not_done')) then 'not_done'"
        "  when bool_or(s.planned and s.state = 'moved') then 'moved'"
        "  when bool_or(s.planned and s.state = 'done') then 'done' else 'none' end as state"
        " from school_class c join school_day d on d.campus_id = c.campus_id"
        " and d.on_date between %(lo)s and %(lo)s::date + 4"
        " left join session s on s.school_class_id = c.id and s.school_day_id = d.id"
        " where c.campus_id = %(campus)s and exists (select 1 from session x where x.school_class_id = c.id)"
        " group by c.grade_code, c.section, d.on_date, d.kind order by c.grade_code, c.section, d.on_date",
        {"campus": campus, "lo": lo},
    ).fetchall()
    got = db.one(
        conn,
        "select count(*) filter (where s.state in ('done', 'moved')) as done, count(*) as planned"
        " from session s join school_class c on c.id = s.school_class_id"
        " join school_day d on d.id = s.school_day_id and d.kind <> 'holiday'"
        " where c.campus_id = %s and s.planned and d.on_date between %s and %s::date + 4",
        (campus, lo, lo),
    )
    return {"cells": cells, "sessions_done": got["done"], "sessions_planned": got["planned"]}


def _readiness(conn: db.Conn, campus: str) -> dict:
    return db.one(
        conn,
        "select"
        " (select count(*) from child ch join enrolment e on e.child_id = ch.id and e.to_date is null"
        "   join school_class c on c.id = e.class_id where c.campus_id = %(c)s) as children,"
        " (select count(*) from enrolment e join school_class c on c.id = e.class_id where c.campus_id = %(c)s"
        "   and e.to_date is null and (select k.decision from consent k where k.child_id = e.child_id"
        "    order by k.created_at desc, k.id desc limit 1) = 'given') as children_with_consent,"
        " (select count(*) from activity) as activities,"
        " (select count(*) from activity where btrim(steps) <> '' and btrim(level_1) <> ''"
        "   and btrim(level_2) <> '' and btrim(level_3) <> '') as activities_ready,"
        " (select count(*) from activity_material) as materials,"
        " (select count(*) from activity_material where quantity is not null) as materials_with_quantity",
        {"c": campus},
    )


def _new_next_week(conn: db.Conn, campus: str, lo: dt.date, hi: dt.date) -> list[dict]:
    """Activities in next week's lessons that no earlier lesson (of any class) has used, with the classes they fall in."""
    return conn.execute(
        "with week as (select a.id, a.code, a.name, s.subject_code, c.grade_code, c.section, d.on_date"
        " from session s join plan_entry p on p.id = s.plan_entry_id join activity a on a.id = p.activity_id"
        " join school_class c on c.id = s.school_class_id join school_day d on d.id = s.school_day_id"
        " where c.campus_id = %(campus)s and d.on_date between %(lo)s and %(hi)s)"
        " select w.code, w.name, min(w.subject_code) as subject,"
        " array_agg(distinct w.grade_code || ' ' || coalesce(w.section, '') order by w.grade_code || ' ' || coalesce(w.section, '')) as classes"
        " from week w where not exists (select 1 from session s2 join plan_entry p2 on p2.id = s2.plan_entry_id"
        "  join school_day d2 on d2.id = s2.school_day_id where p2.activity_id = w.id and d2.on_date < %(lo)s)"
        " group by w.code, w.name order by min(w.on_date), w.name",
        {"campus": campus, "lo": lo, "hi": hi},
    ).fetchall()


def school(conn: db.Conn, email: str) -> dict:
    """What waits on the coordinator across the school, and the week behind and ahead, in the school's own words."""
    cfg = k2_reads._cfg(conn)
    _, campus = k2_reads.require_coordinator(conn, email, cfg)
    today = settings.school_today(conn)
    last, nxt = _weeks(cfg, today)
    drafts = _drafts(conn, campus, today)
    lines = _no_quantity(conn, campus, nxt, nxt + dt.timedelta(days=6))
    ready = _readiness(conn, campus)
    return {
        "clashes": _clashes(conn, campus, today),
        "drafts": {"count": len(drafts), "rows": drafts},
        "late_notes": k2_reads._counts(conn, cfg, campus)["late"],
        "materials_no_quantity": {"count": sum(r["lines"] for r in lines), "rows": lines},
        "last_week": _last_week(conn, campus, last),
        "next_week": {
            "from": nxt,
            "new_activities": _new_next_week(conn, campus, nxt, nxt + dt.timedelta(days=6)),
        },
        "ready": ready,
    }
