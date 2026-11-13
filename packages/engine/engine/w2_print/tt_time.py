"""CP-41: where a class's teaching time goes (page charter B3, Time by subject). Reads only, in code, no model and no name.

For a date range and one class, or every class of a grade, it sums the minutes of the lessons held (every lesson but a fixed
one, its period's length) by subject, over the range and a week at a time, and sets each subject beside the standing
timetable (the `frame` rules, `timetable_rule`) for the same school days: what the timetable gives it, in minutes and as a
share of the teaching time, and what the lessons now are. Only days that have lessons for the class count on both sides, so a
fortnight not yet generated is neither short nor over. A subject is `within` its standing time when the minutes are inside
the school's tolerance of it (config `timetable.time_tolerance_pct`), `over` or `short` outside, `no_standing_time` (and no
target share: none is invented) when the frame gives it none. A period the frame gives no end lasts until the next starts,
as the day view does."""

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

# a week is named by its Monday
_TAUGHT = (
    _MINS
    + """
select (days.on_date - (extract(isodow from days.on_date)::int - 1))::date as week_start, s.subject_code,
  count(*) as lessons, coalesce(sum(p.mins), 0) as minutes
from session s join days on days.id = s.school_day_id and days.school_class_id = s.school_class_id
join p on p.id = s.period_id
where s.subject_code is not null and s.kind <> 'fixed'
group by 1, 2
"""
)

_STANDING = (
    _MINS
    + """
select r.subject_code, count(*) as lessons, coalesce(sum(p.mins), 0) as minutes
from days
join school_class c on c.id = days.school_class_id
join fortnight f on f.kind = 'teaching' and f.academic_year_id = c.academic_year_id
  and days.on_date between f.starts_on and f.ends_on
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


def _weeks(taught: list[dict], start: dt.date, end: dt.date) -> list[dict]:
    """Every week of the range from its Monday, each with its minutes by subject (most first); a week with no lessons is empty."""
    by_week: dict[dt.date, list[dict]] = {}
    for r in sorted(taught, key=lambda r: (-float(r["minutes"]), r["subject_code"])):
        by_week.setdefault(r["week_start"], []).append(
            {"subject_code": r["subject_code"], "minutes": round(r["minutes"])}
        )
    weeks, at = [], start - dt.timedelta(days=start.weekday())
    while at <= end:
        weeks.append({"week_start": at.isoformat(), "subjects": by_week.get(at, [])})
        at += dt.timedelta(days=7)
    return weeks


def time_by_subject(conn: db.Conn, class_ids: list[str], start: dt.date, end: dt.date) -> dict:
    """Minutes and lessons per subject over `start`..`end` for the classes named, with the standing time beside each, and
    the same minutes a week at a time."""
    q = {"cls": class_ids, "a": start, "b": end}
    weekly = conn.execute(_TAUGHT, q).fetchall()
    taught: dict[str, dict] = {}
    for r in weekly:
        t = taught.setdefault(r["subject_code"], {"lessons": 0, "minutes": 0.0})
        t["lessons"] += int(r["lessons"])
        t["minutes"] += float(r["minutes"])
    standing = {r["subject_code"]: r for r in conn.execute(_STANDING, q).fetchall()}
    tolerance = float(settings.config(conn, "timetable.time_tolerance_pct", 10))
    listed = tt_heads.heads(conn)
    total = sum(t["minutes"] for t in taught.values())
    given = sum(float(r["minutes"]) for r in standing.values())
    rows = []
    for code in sorted(set(taught) | set(standing)):
        t, s = taught.get(code), standing.get(code)
        minutes = t["minutes"] if t else 0.0
        target = float(s["minutes"]) if s else 0.0
        rows.append({
            "subject": code, "label": tt_heads.label_of(listed, code) or code,
            "lessons": t["lessons"] if t else 0, "minutes": round(minutes),
            "share_pct": round(100 * minutes / total, 1) if total else 0.0,
            "standing_lessons": int(s["lessons"]) if s else 0, "standing_minutes": round(target),
            "target_share_pct": round(100 * target / given, 1) if target > 0 else None,
            "status": _status(minutes, target, tolerance),
        })  # fmt: skip
    rows.sort(key=lambda r: (-r["minutes"], r["subject"]))
    return {
        "start": start.isoformat(), "end": end.isoformat(), "classes": len(class_ids),
        "total_minutes": round(total), "tolerance_pct": tolerance, "subjects": rows,
        "weeks": _weeks(weekly, start, end),
    }  # fmt: skip


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


def classes_named(conn: db.Conn, class_ids: list[str]) -> list[dict]:
    """The classes named, by grade and section."""
    return conn.execute(
        "select id::text as id, grade_code as grade, section from school_class where id = any(%s::uuid[])"
        " order by grade_code, section",
        ([str(i) for i in class_ids],),
    ).fetchall()
