"""CP-71: what the Build page's home needs (design wireframe 1, `/timetable/build/home`): one card's facts per class of the year that holds
`today`, and whether the next fortnight can be published. Per class: has it a day shape, how many lesson places are filled of how many there
are, the next fortnight it has no lessons for, how many cells that fortnight's pattern changes from the last published one, its open
problems, and one state word (todo, waiting, fix, done). Reads only; code decides; no model, no name."""

import datetime as dt

from engine.core import db
from engine.w2_print import tt_check, tt_check_load, tt_pattern


def _year(conn: db.Conn, today: dt.date) -> dict | None:
    return conn.execute(
        "select id::text as id, label from academic_year where starts_on <= %s and ends_on >= %s order by starts_on desc limit 1",
        (today, today),
    ).fetchone()


def _fortnight_of(conn: db.Conn, class_id: str, on: dt.date) -> dict | None:
    return conn.execute(
        "select f.number, f.starts_on, f.ends_on from fortnight f join school_class c on c.academic_year_id = f.academic_year_id"
        " where c.id = %s and f.kind = 'teaching' and f.starts_on = %s",
        (class_id, on),
    ).fetchone()


def _next(conn: db.Conn, class_id: str, today: dt.date) -> dict | None:
    """The first teaching fortnight not over that has no lessons for the class; none when every one has."""
    row = conn.execute(
        "select f.number, f.starts_on, f.ends_on from fortnight f join school_class c on c.academic_year_id = f.academic_year_id"
        " where c.id = %s and f.kind = 'teaching' and f.ends_on >= %s and not exists (select 1 from session s join school_day d"
        " on d.id = s.school_day_id where s.school_class_id = c.id and d.on_date between f.starts_on and f.ends_on)"
        " order by f.starts_on limit 1",
        (class_id, today),
    ).fetchone()
    return (
        {
            "number": row["number"],
            "starts_on": row["starts_on"].isoformat(),
            "ends_on": row["ends_on"].isoformat(),
        }
        if row
        else None
    )


def _differs(conn: db.Conn, class_id: str, today: dt.date, nxt: dict | None) -> int:
    """How many cells the next fortnight's pattern holds differently from the pattern at the last published fortnight's start."""
    last = conn.execute(
        "select max(f.starts_on) as d from fortnight f join school_day d on d.on_date between f.starts_on and f.ends_on"
        " join session s on s.school_day_id = d.id where s.school_class_id = %s and f.starts_on <= %s",
        (class_id, today),
    ).fetchone()
    if not nxt or not last or last["d"] is None:
        return 0
    key = lambda on: {  # noqa: E731
        (c["period_id"], c["week"], c["weekday"]): (c["cell"], c["subject_code"], c["text"])
        for c in tt_pattern.read(conn, class_id, on)["cells"]
    }
    then, now = key(last["d"]), key(dt.date.fromisoformat(nxt["starts_on"]))
    return sum(then.get(p) != now.get(p) for p in {*then, *now})


def home(conn: db.Conn, today: dt.date) -> dict:
    year = _year(conn, today)
    rows = (
        conn.execute(
            "select id::text as id, grade_code as grade, section from school_class where academic_year_id::text = %s order by grade_code, section",
            (year["id"],),
        ).fetchall()
        if year
        else []
    )
    ids = [r["id"] for r in rows]
    with_pattern = tt_check_load.classes_with_pattern(conn)
    everyone = list(dict.fromkeys([*ids, *with_pattern]))
    problems = tt_check.check(tt_check_load.world(conn, everyone, today)) if everyone else []
    cards = []
    for r in rows:
        periods = tt_pattern.periods_at(conn, r["grade"], today)
        places = [p for p in periods if not p["fixed"]]
        cells = tt_pattern.read(conn, r["id"], today)["cells"] if periods else []
        placed = sum(c["cell"] in tt_check.LESSONS for c in cells)
        mine = [p for p in problems if any(x["class_id"] == r["id"] for x in p["places"])]
        stop = [p for p in tt_check.blocking(mine)]
        nxt = _next(conn, r["id"], today)
        total = len(places) * 10
        state = "todo" if not periods else "fix" if stop else "waiting" if placed < total or nxt else "done"
        cards.append({
            "class_id": r["id"], "name": f"{r['grade']} {r['section']}", "grade": r["grade"], "has_day": bool(periods),
            "placed": placed, "total": total, "next_fortnight": nxt, "changes_from_published": _differs(conn, r["id"], today, nxt),
            "problems": {"must": sum(p["level"] == tt_check.MUST and not p["allowed"] for p in mine), "try": sum(p["level"] == tt_check.TRY for p in mine)},
            "state": state,
        })  # fmt: skip
    stopping = tt_check.blocking(problems)
    return {
        "year": year["label"] if year else None, "classes": cards, "can_publish": not stopping,
        "blocked_by": stopping[0]["sentence"] if stopping else None,
    }  # fmt: skip
