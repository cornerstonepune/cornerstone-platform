"""CP-41: where a class's teaching time goes (charter B3). Reads only, in code, no model and no name.

For a date range and one class, or every class of a grade, it sums the minutes of the lessons that hold a subject and sets
each subject beside the standing timetable (the `frame` rules, `timetable_rule`) for the same school days: what the
timetable gives it and what the lessons now are. Only days that have lessons for the class count on both sides, so a
fortnight not yet generated is neither short nor over. A subject is `within` its standing time when the minutes are inside
the school's tolerance of it (config `timetable.time_tolerance_pct`), `over` or `short` outside, `no_standing_time` when the
frame gives it none. A period the frame gives no end lasts until the next starts, as the day view does.

`weeks_by_subject` is the same reading for the Time by subject page (page charter B3): a week at a time, and each subject's
share of the range beside the share the frame gives it."""

import datetime as dt

from engine.core import db, settings
from engine.w2_print import tt_heads

_MINS = """
with p as (
  select id, extract(epoch from coalesce(ends_at, lead(starts_at) over (partition by tenant_id, grade_code order by ord))
    - starts_at) / 60 as mins
  from period),
days as (
  select distinct d.id, d.on_date, s.school_class_id
  from session s join school_day d on d.id = s.school_day_id
  where s.school_class_id = any(%(cls)s) and d.on_date between %(a)s and %(b)s and d.kind <> 'holiday')
"""

_TAUGHT = (
    _MINS
    + """
select s.subject_code, count(*) as lessons, coalesce(sum(p.mins), 0) as minutes
from session s join days on days.id = s.school_day_id and days.school_class_id = s.school_class_id
join p on p.id = s.period_id
where s.subject_code is not null
group by s.subject_code
"""
)

_STANDING = (
    _MINS
    + """
select r.subject_code, count(*) as lessons, coalesce(sum(p.mins), 0) as minutes
from days
join fortnight f on f.kind = 'teaching' and days.on_date between f.starts_on and f.ends_on
join timetable_rule r on r.school_class_id = days.school_class_id and r.kind = 'frame'
  and r.cell in ('subject', 'specialist') and r.subject_code is not null
  and r.weekday = extract(isodow from days.on_date)
  and r.week_code = case when days.on_date - f.starts_on < 7 then 'A' else 'B' end
  and r.valid_from <= days.on_date and (r.valid_to is null or r.valid_to >= days.on_date)
join p on p.id = r.period_id
group by r.subject_code
"""
)


def _status(minutes: float, standing: float, tolerance: float) -> str:
    if standing <= 0:
        return "no_standing_time"
    if minutes > standing * (1 + tolerance / 100):
        return "over"
    if minutes < standing * (1 - tolerance / 100):
        return "short"
    return "within"


def time_by_subject(conn: db.Conn, class_ids: list[str], start: dt.date, end: dt.date) -> dict:
    """Minutes and lessons per subject over `start`..`end` for the classes named, with the standing time beside each."""
    q = {"cls": class_ids, "a": start, "b": end}
    taught = {r["subject_code"]: r for r in conn.execute(_TAUGHT, q).fetchall()}
    standing = {r["subject_code"]: r for r in conn.execute(_STANDING, q).fetchall()}
    tolerance = float(settings.config(conn, "timetable.time_tolerance_pct", 10))
    listed = tt_heads.heads(conn)
    total = sum(float(r["minutes"]) for r in taught.values())
    rows = []
    for code in sorted(set(taught) | set(standing)):
        t, s = taught.get(code), standing.get(code)
        minutes = float(t["minutes"]) if t else 0.0
        target = float(s["minutes"]) if s else 0.0
        rows.append({
            "subject": code, "label": tt_heads.label_of(listed, code) or code,
            "lessons": int(t["lessons"]) if t else 0, "minutes": round(minutes),
            "share_pct": round(100 * minutes / total, 1) if total else 0.0,
            "standing_lessons": int(s["lessons"]) if s else 0, "standing_minutes": round(target),
            "status": _status(minutes, target, tolerance),
        })  # fmt: skip
    rows.sort(key=lambda r: -r["minutes"])
    return {
        "start": start.isoformat(), "end": end.isoformat(), "classes": len(class_ids),
        "total_minutes": round(total), "tolerance_pct": tolerance, "subjects": rows,
    }  # fmt: skip


_WEEKLY = (
    _MINS
    + """
select (d.on_date - (extract(isodow from d.on_date)::int - 1))::date as week_start, s.subject_code,
  coalesce(sum(p.mins), 0) as minutes
from session s join days on days.id = s.school_day_id and days.school_class_id = s.school_class_id
join school_day d on d.id = s.school_day_id
join p on p.id = s.period_id
where s.subject_code is not null and s.kind <> 'fixed'
group by 1, 2
"""
)


def _monday(d: dt.date) -> dt.date:
    return d - dt.timedelta(days=d.weekday())


def weeks_by_subject(conn: db.Conn, class_ids: list[str], start: dt.date, end: dt.date) -> dict:
    """Charter B3: the minutes of the lessons held (every lesson but a fixed one, its period's length) for the classes
    named, a week at a time (each week from its Monday, every week of the range listed, one with no lessons empty), and
    over the whole range each subject's share of the teaching time beside the share the frame rules give it for the same
    days (`target_share`). A subject the rules give no time has no target and no status: none is invented. A status is
    the share against the target, inside the school's tolerance of it (`timetable.time_tolerance_pct`) or outside."""
    q = {"cls": class_ids, "a": start, "b": end}
    weekly = conn.execute(_WEEKLY, q).fetchall()
    standing = {r["subject_code"]: float(r["minutes"]) for r in conn.execute(_STANDING, q).fetchall()}
    tolerance = float(settings.config(conn, "timetable.time_tolerance_pct", 10))
    listed = tt_heads.heads(conn)
    taught: dict[str, float] = {}
    by_week: dict[dt.date, list[dict]] = {}
    for r in sorted(weekly, key=lambda r: (r["week_start"], -float(r["minutes"]), r["subject_code"])):
        taught[r["subject_code"]] = taught.get(r["subject_code"], 0.0) + float(r["minutes"])
        by_week.setdefault(r["week_start"], []).append(
            {"subject_code": r["subject_code"], "minutes": round(r["minutes"])}
        )
    weeks, at = [], _monday(start)
    while at <= end:
        weeks.append({"week_start": at.isoformat(), "subjects": by_week.get(at, [])})
        at += dt.timedelta(days=7)
    total, given = sum(taught.values()), sum(standing.values())
    totals = []
    for code in set(taught) | {c for c, m in standing.items() if m > 0}:
        share = taught.get(code, 0.0) / total if total else 0.0
        target = standing[code] / given if standing.get(code) else None
        totals.append({
            "subject_code": code, "label": tt_heads.label_of(listed, code) or code, "minutes": round(taught.get(code, 0.0)),
            "share": round(share, 4), "target_share": None if target is None else round(target, 4),
            "status": None if target is None else _status(share, target, tolerance),
        })  # fmt: skip
    totals.sort(key=lambda r: (-r["minutes"], r["subject_code"]))
    return {"weeks": weeks, "totals": totals, "total_minutes": round(total), "tolerance_pct": tolerance}


def classes_with_lessons(conn: db.Conn, grade: str | None, start: dt.date, end: dt.date) -> list[dict]:
    """Every class with lessons in the range, of the grade when one is named, by grade and section."""
    return conn.execute(
        "select distinct c.id::text as id, c.grade_code as grade, c.section from school_class c"
        " join session s on s.school_class_id = c.id join school_day d on d.id = s.school_day_id"
        " where (%(g)s::text is null or c.grade_code = %(g)s) and d.on_date between %(a)s and %(b)s"
        " order by c.grade_code, c.section",
        {"g": grade, "a": start, "b": end},
    ).fetchall()


def class_ids_of(conn: db.Conn, grade: str, start: dt.date, end: dt.date) -> list[str]:
    """Every class of the grade that has lessons in the range."""
    return [r["id"] for r in classes_with_lessons(conn, grade, start, end)]
