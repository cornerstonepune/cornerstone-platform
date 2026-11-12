"""CP-41: where a class's teaching time goes (charter B3). Reads only, in code, no model and no name.

For a date range and one class, or every class of a grade, it sums the minutes of the lessons that hold a subject and sets
each subject beside the standing timetable (the `frame` rules, `timetable_rule`) for the same school days: what the
timetable gives it and what the lessons now are. Only days that have lessons for the class count on both sides, so a
fortnight not yet generated is neither short nor over. A subject is `within` its standing time when the minutes are inside
the school's tolerance of it (config `timetable.time_tolerance_pct`), `over` or `short` outside, `no_standing_time` when the
frame gives it none. A period the frame gives no end lasts until the next starts, as the day view does."""

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


def class_ids_of(conn: db.Conn, grade: str, start: dt.date, end: dt.date) -> list[str]:
    """Every class of the grade that has lessons in the range."""
    return [
        r["id"]
        for r in conn.execute(
            "select distinct c.id::text as id from school_class c join session s on s.school_class_id = c.id"
            " join school_day d on d.id = s.school_day_id where c.grade_code = %s and d.on_date between %s and %s",
            (grade, start, end),
        ).fetchall()
    ]
