"""CP-11: what a class's fortnight needs, worked out by code before FET places anything (design.md §1). The days, the
standing frame, the lessons each subject needs once its limits are applied, the cells nothing may use, and the checks
that name the rule when the fortnight cannot be met. Reads rows only. No name, no model."""

import datetime as dt
from dataclasses import dataclass, field

from engine.core import db
from engine.w2_print import tt_rules as rules

WEEKDAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday")
FREE_KINDS = ("subject", "empty")  # `fixed` and `specialist` cells are pinned where they are


class NoSuchFortnight(Exception):
    """The class or the fortnight is not on this database."""


@dataclass
class Day:
    date: dt.date
    week: (
        str  # "A" if fewer than 7 days after the fortnight starts, else "B" (the day page's rule, k2_day.py)
    )


@dataclass
class Inputs:
    class_id: str
    tenant_id: str
    fortnight_id: str
    name: str
    days: list[Day]
    periods: list[dict]
    frame: dict[tuple[str, int, str], tuple[str, str | None]]  # (week, weekday, period id) -> (kind, subject)
    blocks: list[dict]
    limits: list[dict]


@dataclass
class Needs:
    lessons: dict[str, dict[str, int]]  # subject -> week -> lessons
    weekly: set[str]  # subjects with a week limit: their lessons stay in their week
    base: dict[str, int]  # subject -> lessons the frame itself holds
    contradiction: list[dict] = field(
        default_factory=list
    )  # limits that cannot both hold, in their own words

    def total(self, subject: str | None = None) -> int:
        return sum(sum(w.values()) for s, w in self.lessons.items() if subject in (None, s))


def load(conn: db.Conn, grade: str, section: str, year: str, number: int) -> Inputs:
    found = conn.execute(
        "select c.id::text as id, c.tenant_id::text as tenant, c.campus_id, f.id::text as fortnight, f.starts_on, f.ends_on"
        " from school_class c join academic_year y on y.id = c.academic_year_id"
        " join fortnight f on f.academic_year_id = y.id and f.number = %s"
        " where c.grade_code = %s and c.section = %s and y.label = %s",
        (number, grade, section, year),
    ).fetchone()
    if found is None:
        raise NoSuchFortnight(f"no class {grade} {section} {year} with a fortnight {number} on this database")
    held = {
        r["on_date"]
        for r in conn.execute(
            "select on_date from school_day where campus_id = %s and kind = 'holiday' and on_date between %s and %s",
            (found["campus_id"], found["starts_on"], found["ends_on"]),
        ).fetchall()
    }
    span = (found["ends_on"] - found["starts_on"]).days + 1
    every = [found["starts_on"] + dt.timedelta(days=i) for i in range(span)]
    days = [
        Day(d, "A" if (d - found["starts_on"]).days < 7 else "B")
        for d in every
        if d.isoweekday() <= 5 and d not in held
    ]
    frame = {
        (r["week_code"], r["weekday"], r["period_id"]): (r["kind"], r["subject_code"])
        for r in conn.execute(
            "select week_code, weekday, period_id::text as period_id, kind, subject_code from timetable_slot"
            " where school_class_id = %s and valid_to is null",
            (found["id"],),
        ).fetchall()
    }
    return Inputs(found["id"], found["tenant"], found["fortnight"], f"{grade} {section}", days,
                  rules._periods(conn, grade), frame, rules._blocks(conn, found["id"]), rules._limits(conn, found["id"]))  # fmt: skip


def blocked(i: Inputs, day: Day, period_id: str) -> list[dict]:
    """The blocks that stop anything being placed on this day and period."""
    out = []
    for b in i.blocks:
        if b["on_date"] is not None and b["on_date"] != day.date.isoformat():
            continue
        if b["on_date"] is None and (
            b["weekday"] != day.date.isoweekday() or b["week"] not in (None, day.week)
        ):
            continue
        if b["period_id"] in (None, period_id):
            out.append(b)
    return out


def is_free(i: Inputs, day: Day, period_id: str) -> bool:
    kind = i.frame.get((day.week, day.date.isoweekday(), period_id), (None, None))[0]
    return kind in FREE_KINDS and not blocked(i, day, period_id)


def weeks(i: Inputs) -> list[str]:
    return sorted({d.week for d in i.days})


def _clamp(n: int, fewest: int | None, most: int | None) -> int:
    return min(max(n, fewest or 0), most if most is not None else max(n, fewest or 0))


def _limit_for(i: Inputs, subject: str, span: str) -> dict:
    return next((x for x in i.limits if x["subject_code"] == subject and x["span"] == span), {})


def needs(i: Inputs) -> Needs:
    """Each subject's lessons per week: its subject cells on the fortnight's teaching days (a blocked cell's lesson is
    moved, not dropped), then its week limit per week, then its fortnight limit on the total."""
    ws = weeks(i)
    cells: dict[str, dict[str, int]] = {}
    for d in i.days:
        for (week, weekday, _), (kind, subject) in i.frame.items():
            if kind == "subject" and subject and week == d.week and weekday == d.date.isoweekday():
                cells.setdefault(subject, {w: 0 for w in ws})[d.week] += 1
    for x in i.limits:
        cells.setdefault(x["subject_code"], {w: 0 for w in ws})
    out = Needs(
        {},
        {x["subject_code"] for x in i.limits if x["span"] == "week"},
        {s: sum(w.values()) for s, w in cells.items()},
    )
    for subject, per_week in sorted(cells.items()):
        wk, fn = _limit_for(i, subject, "week"), _limit_for(i, subject, "fortnight")
        out.lessons[subject] = {w: _clamp(n, wk.get("fewest"), wk.get("most")) for w, n in per_week.items()}
        if fn and not _fit_fortnight(out.lessons[subject], wk, fn):
            out.contradiction += [_say(x) for x in (wk, fn)]
    return out


def _can_move(n: int, wk: dict, up: bool) -> bool:
    if up:
        return wk.get("most") is None or n < wk["most"]
    return n > (wk.get("fewest") or 0)


def _fit_fortnight(per_week: dict[str, int], wk: dict, fn: dict) -> bool:
    """Move the subject's total to its fortnight limit one lesson at a time, keeping each week inside its week limit.
    False when no week can move: the two limits contradict."""
    target = _clamp(sum(per_week.values()), fn.get("fewest"), fn.get("most"))
    while sum(per_week.values()) != target:
        up = sum(per_week.values()) < target
        room = [w for w, n in sorted(per_week.items()) if _can_move(n, wk, up)]
        if not room:
            return False
        w = min(room, key=lambda k: per_week[k]) if up else max(room, key=lambda k: per_week[k])
        per_week[w] += 1 if up else -1
    return True


def _say(x: dict) -> dict:
    parts = ([f"at least {x['fewest']}"] if x.get("fewest") is not None else []) + (
        [f"at most {x['most']}"] if x.get("most") is not None else []
    )
    return {
        "kind": "limit",
        "id": x["id"],
        "words": f"{x['subject_code']}: {' and '.join(parts)} in a {x['span']}",
    }


def say_block(b: dict) -> dict:
    when = b["on_date"] or f"{WEEKDAYS[b['weekday'] - 1]}{' week ' + b['week'] if b['week'] else ''}"
    return {
        "kind": "block",
        "id": b["id"],
        "words": f"{b['reason']} ({when}{', ' + b['period'] if b['period'] else ''})",
    }


def free_by_week(i: Inputs) -> dict[str, int]:
    out = {w: 0 for w in weeks(i)}
    for d in i.days:
        out[d.week] += sum(1 for p in i.periods if is_free(i, d, p["id"]))
    return out


def checks(i: Inputs, n: Needs) -> tuple[list[str], list[dict]]:
    """→ (what fails, the rules that take or need the cells). Empty when the fortnight can go to FET."""
    if n.contradiction:
        return [
            "limits that cannot both hold: " + "; ".join(c["words"] for c in n.contradiction)
        ], n.contradiction
    free, why = free_by_week(i), []
    for w, left in free.items():
        weekly = sum(n.lessons[s].get(w, 0) for s in n.weekly)
        if weekly > left:
            why.append(f"Week {w}: {weekly} lessons with a week limit, {left} free periods")
    if n.total() > sum(free.values()):
        why.append(f"Fortnight: {n.total()} lessons needed, {sum(free.values())} free periods")
    if not why:
        return [], []
    raised = [_say(x) for x in i.limits if n.total(x["subject_code"]) > n.base.get(x["subject_code"], 0)]
    taking = [say_block(b) for b in i.blocks if _takes_a_free_cell(i, b)]
    return why, raised + taking


def _takes_a_free_cell(i: Inputs, b: dict) -> bool:
    return any(
        b in blocked(i, d, p["id"])
        and i.frame.get((d.week, d.date.isoweekday(), p["id"]), ("",))[0] in FREE_KINDS
        for d in i.days
        for p in i.periods
    )
