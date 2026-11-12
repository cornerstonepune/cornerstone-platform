"""Attendance per child per day (CP-42): loaded from the school's attendance report, read for a child and for a class.

The report has names; they never reach a table, a log or an answer. A row is matched to a child by the name in `pii.child`
(first and last name, spaces and case ignored); a name that matches no child, or more than one, is not loaded and is
reported by its row number and program only, never guessed. Who marked a row is not kept. A row says `leave` when it
carries a leave time, `absent` when it carries an absent time or has no in-time and no minutes, else `present`."""

import datetime as dt
import re
from collections import defaultdict
from typing import Any

from engine.core import db, settings

_MONTHS = {m: i for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split(), 1)}
_NONE = {"", "---", "-", "none"}


def _clean(v: Any) -> str:
    return "" if v is None else str(v).strip()


def parse_date(text: Any) -> dt.date | None:
    """`28 Sept 2026` → a date (the month is read by its first three letters); None when it is not one."""
    m = re.fullmatch(r"(\d{1,2})\s+([A-Za-z]{3,})\.?,?\s+(\d{4})", _clean(text))
    month = _MONTHS.get(m.group(2)[:3].lower()) if m else None
    try:
        return dt.date(int(m.group(3)), month, int(m.group(1))) if m and month else None
    except ValueError:
        return None


def parse_time(text: Any) -> dt.time | None:
    """`09:35 AM` → a time; None for a dash or nothing."""
    t = _clean(text)
    if t.lower() in _NONE:
        return None
    for fmt in ("%I:%M %p", "%H:%M"):
        try:
            return dt.datetime.strptime(t, fmt).time()
        except ValueError:
            continue
    return None


def parse_minutes(*texts: Any) -> int | None:
    """`2 hrs, 59 mins` → 179; `4 hrs` → 240; `0 mins` or 0 → 0; the first of the texts that says anything."""
    for text in texts:
        t = _clean(text)
        if t.lower() in _NONE:
            continue
        hours, mins = re.search(r"(\d+)\s*hr", t), re.search(r"(\d+)\s*min", t)
        if hours or mins:
            return int(hours.group(1) if hours else 0) * 60 + int(mins.group(1) if mins else 0)
        if re.fullmatch(r"\d+(\.\d+)?", t):
            return round(float(t) * 60) if "." in t else int(t)
    return None


def status_of(row: dict[str, Any], minutes: int | None, in_time: dt.time | None) -> str:
    if _clean(row.get("leave")).lower() not in _NONE:
        return "leave"
    if _clean(row.get("absent")).lower() not in _NONE or (in_time is None and not minutes):
        return "absent"
    return "present"


def _tokens(name: Any) -> list[str]:
    return re.sub(r"[^\w\s]", " ", _clean(name)).lower().split()


def _key(name: Any) -> str:
    return " ".join(_tokens(name))


class _Index:
    """The children by name, as `pii.child` holds them: by full name, and by name with the grade each is in now."""

    def __init__(self, conn: db.Conn) -> None:
        self.full: dict[str, list[Any]] = defaultdict(list)
        self.people: list[tuple[Any, list[str], str | None]] = []
        for r in conn.execute(
            "select p.child_id, p.first_name, p.last_name, (select k.grade_code from enrolment e join school_class k"
            " on k.id = e.class_id where e.child_id = p.child_id and e.to_date is null limit 1) as grade from pii.child p"
        ).fetchall():
            name = f"{r['first_name']} {r['last_name']}"
            self.full[_key(name)].append(r["child_id"])
            self.people.append((r["child_id"], _tokens(name), r["grade"]))
        self.grades: dict[str, str] = dict(settings.config(conn, "attendance.program_grades", {}) or {})

    def find(self, name: Any, program: str) -> tuple[list[Any], bool]:
        """The children this report name can be, and whether it was by first name in the grade. The full name first; when
        no child has it, a child whose stored name is only the start of the report's (a first name, with the surname the
        report adds), in the grade the program is (`attendance.program_grades`). More than one is never picked."""
        ids = self.full.get(_key(name), [])
        grade = self.grades.get(program)
        if ids or not grade:
            return ids, False
        tokens = _tokens(name)
        return [i for i, t, g in self.people if g == grade and t and tokens[: len(t)] == t], True


def load(conn: db.Conn, rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Write each row of the report as that child's day. Idempotent: the same report twice leaves the same rows. The
    answer counts the rows and lists the ones not loaded by number (from 1) and program: never a name."""
    tenant = db.one(conn, "select id from tenant where slug = %s", (db.tenant_slug(),))["id"]
    known = _Index(conn)
    by_grade = 0
    loaded = 0
    skipped: list[dict[str, Any]] = []
    seen: set[tuple[Any, dt.date]] = set()
    for n, row in enumerate(rows, 1):
        day, program = parse_date(row.get("date")), _clean(row.get("program"))
        ids, in_grade = known.find(row.get("name"), program)
        if day is None or not program:
            skipped.append({"row": n, "program": program or None, "why": "not a date or no program"})
            continue
        if len(ids) != 1:
            skipped.append(
                {
                    "row": n,
                    "program": program,
                    "why": "no child of that name" if not ids else "two children of that name",
                }
            )
            continue
        in_time, minutes = parse_time(row.get("in")), parse_minutes(row.get("total_hours"), row.get("hours"))
        conn.execute(
            "insert into attendance (tenant_id, child_id, on_date, program, status, in_time, out_time, minutes)"
            " values (%s, %s, %s, %s, %s, %s, %s, %s)"
            " on conflict (tenant_id, child_id, on_date) do update set program = excluded.program, status = excluded.status,"
            " in_time = excluded.in_time, out_time = excluded.out_time, minutes = excluded.minutes, updated_at = now()",
            (tenant, ids[0], day, program, status_of(row, minutes, in_time), in_time, parse_time(row.get("out")), minutes),
        )  # fmt: skip
        seen.add((ids[0], day))
        loaded += 1
        by_grade += int(in_grade)
    return {
        "rows": len(rows), "loaded": loaded, "by_first_name_in_grade": by_grade, "days_written": len(seen), "not_loaded": len(skipped),
        "children_not_matched": len({s["row"] for s in skipped if s["why"] != "not a date or no program"}),
        "skipped": skipped[:200],
    }  # fmt: skip


def _late(starts: dict[str, str], program: str, in_time: dt.time | None) -> bool | None:
    """Late by the school's start time for the program (`attendance.start_times`); None when none is set."""
    t = parse_time(starts.get(program))
    return None if t is None or in_time is None else in_time > t


_SUM = """
select {bucket} as bucket, count(*) as days, count(*) filter (where status = 'present') as present,
  count(*) filter (where status = 'absent') as absent, count(*) filter (where status = 'leave') as leave
from attendance a {join}
where {who} and a.on_date between %(a)s and %(b)s group by 1 order by 1
"""


def _shape(r: dict[str, Any]) -> dict[str, Any]:
    return {
        "bucket": r["bucket"], "days": r["days"], "present": r["present"], "absent": r["absent"], "leave": r["leave"],
        "present_pct": round(100 * r["present"] / r["days"], 1) if r["days"] else None,
    }  # fmt: skip


def child(conn: db.Conn, child_id: str, start: dt.date, end: dt.date) -> dict[str, Any]:
    """One child's days between two dates, by month, with the late arrivals by the school's start time."""
    q = {"c": child_id, "a": start, "b": end}
    sql = _SUM.format(bucket="to_char(a.on_date, 'YYYY-MM')", join="", who="a.child_id = %(c)s")
    months = [_shape(r) for r in conn.execute(sql, q).fetchall()]
    starts: dict[str, str] = dict(settings.config(conn, "attendance.start_times", {}) or {})
    count: dict[str, int] = defaultdict(int)
    known: set[str] = set()
    for r in conn.execute(
        "select to_char(on_date, 'YYYY-MM') as m, program, in_time from attendance"
        " where child_id = %(c)s and status = 'present' and on_date between %(a)s and %(b)s",
        q,
    ).fetchall():
        flag = _late(starts, r["program"], r["in_time"])
        if flag is not None:
            known.add(r["m"])
            count[r["m"]] += flag
    for m in months:
        m["late"] = count[m["bucket"]] if m["bucket"] in known else None
    tot = {k: sum(m[k] for m in months) for k in ("days", "present", "absent", "leave")}
    return {"start": start.isoformat(), "end": end.isoformat(), **tot,
            "present_pct": round(100 * tot["present"] / tot["days"], 1) if tot["days"] else None, "months": months}  # fmt: skip


def klass(conn: db.Conn, class_id: str, start: dt.date, end: dt.date, by: str = "week") -> dict[str, Any]:
    """A class's days between two dates by week (its Monday) or month: the children enrolled in it on each day."""
    bucket = (
        "to_char(date_trunc('month', a.on_date), 'YYYY-MM')"
        if by == "month"
        else "to_char(date_trunc('week', a.on_date), 'YYYY-MM-DD')"
    )
    join = "join enrolment e on e.child_id = a.child_id and e.from_date <= a.on_date and (e.to_date is null or e.to_date >= a.on_date)"
    sql = _SUM.format(bucket=bucket, join=join, who="e.class_id = %(c)s")
    rows = conn.execute(sql, {"c": class_id, "a": start, "b": end}).fetchall()
    return {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "by": by,
        "buckets": [_shape(r) for r in rows],
    }
