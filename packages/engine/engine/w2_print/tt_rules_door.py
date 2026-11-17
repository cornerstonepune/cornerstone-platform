"""CP-71: the one door of the timetable's rules (design E1 to E3), for the Timetable rules page and the Build page's panel alike.

`read` is `tt_rules.read` plus what the panel shows: every limit with its strength, who teaches the class, and when those educators are away.
`change` writes one rule. Two kinds live here; the day's own (period, block, fixed) stay in `tt_rules`:
  limit  the fewest and most lessons of a subject in a day, a week or a fortnight. *Must* (no `weight`) stops publishing; *Try to* (a
         `weight`, the school's number from the setting `timetable.weights`, never the coordinator's) is counted and never blocks. A day
         limit may be about every subject at once (`tt_check.ANY`): "at most 2 of one subject in a day".
  away   an educator of this class is not in school on a weekday (of week A, B or both), all day or for one period. A row about the
         person (`staff_id`), never about a class, and never a name.
Only the coordinators' group writes (spec S3); anyone on the staff list reads. Every change is kept by the one history trigger."""

import datetime as dt
from typing import Any

import psycopg

from engine.core import db, history, settings, subject_map
from engine.w2_print import tt_check, tt_heads, tt_pattern, tt_rules
from engine.w2_print.tt_rules import Change, Refused

WEIGHTS = "timetable.weights"  # span -> the number a Try to rule of that span carries
SPANS = ("day", "week", "fortnight")
LEVELS = (tt_check.MUST, tt_check.TRY)
HERE = ("limit", "away")
_LIMIT = "id::text as id, subject_code, span, fewest, most, weight"


def _level(row: dict) -> dict:
    out = {k: v for k, v in row.items() if k != "weight"}
    return {**out, "level": tt_check.TRY if row["weight"] else tt_check.MUST}


def limits(conn: db.Conn, class_id: str) -> list[dict]:
    """The class's limits, a day's first, each with its strength."""
    rows = conn.execute(
        f"select {_LIMIT} from timetable_rule where school_class_id = %s and kind = 'limit'"  # noqa: S608
        " order by array_position(array['day', 'week', 'fortnight'], span), subject_code",
        (class_id,),
    ).fetchall()
    return [_level(dict(r)) for r in rows]


def teaches(conn: db.Conn, k: dict, today: dt.date) -> list[dict]:
    """Who teaches this class, without a name: the class's own educator, then each educator a subject is granted to, with the heads they
    hold in the school's order. The page says "the class educator" and "the Hindi educator"."""
    listed = tt_heads.heads(conn)
    spelled = subject_map.spellings(conn, k["tenant_id"])
    grants = conn.execute(
        "select staff_id::text as staff, role_code, subject_code from staff_role_grant where school_class_id = %s"
        " and role_code in ('subject_educator', 'class_teacher') and valid_from <= %s and (valid_to is null or valid_to >= %s)"
        " order by role_code, staff_id",
        (k["id"], today, today),
    ).fetchall()
    out: dict[str, dict] = {}
    for g in grants:
        one = out.setdefault(g["staff"], {"staff_id": g["staff"], "class_educator": False, "subjects": []})
        if g["role_code"] == "class_teacher":
            one["class_educator"] = True
            continue
        for h in listed:
            held = {spelled[s] for s in h["groups"] if s in spelled} | {h["code"]}
            # two heads may be one subject under one word (K2's own head and the subject's code): she is "the Maths educator" once
            if g["subject_code"] in held and h["label"] not in {s["label"] for s in one["subjects"]}:
                one["subjects"].append({"code": h["code"], "label": h["label"]})
    return sorted(out.values(), key=lambda e: (not e["class_educator"], e["staff_id"]))


def away(conn: db.Conn, staff_ids: list[str]) -> list[dict]:
    """When these educators are away, by weekday (an absence on one date is the planner's, not the pattern's)."""
    return [
        dict(r)
        for r in conn.execute(
            "select r.id::text as id, r.staff_id::text as staff_id, r.weekday, r.week_code as week, r.period_id::text as period_id,"
            " p.label as period, r.reason from timetable_rule r left join period p on p.id = r.period_id"
            " where r.kind = 'away' and r.on_date is null and r.staff_id::text = any(%s)"
            " order by r.staff_id, r.weekday, r.week_code nulls first, p.starts_at nulls first",
            (staff_ids,),
        ).fetchall()
    ]


def read(conn: db.Conn, class_id: str | None, me: Any, today: dt.date) -> dict:
    base = tt_rules.read(conn, class_id, me)
    k = tt_pattern._class(conn, base["class"]["id"])
    who = teaches(conn, k, today)
    return {
        **base,
        "limits": limits(conn, k["id"]),
        "teaches": who,
        "away": away(conn, [e["staff_id"] for e in who]),
        "heads": [{"code": h["code"], "label": h["label"]} for h in tt_heads.heads(conn)],
        "any_subject": tt_check.ANY,
    }


def _weight(conn: db.Conn, k: dict, c: Change, old: dict | None) -> int | None:
    """Must is no number; Try to is the school's number for that span. Unsaid: as it was, else a day's limit is a Try to (design E1)."""
    level = c.level or (
        (tt_check.TRY if old["weight"] else tt_check.MUST)
        if old
        else (tt_check.TRY if c.span == "day" else tt_check.MUST)
    )
    if level not in LEVELS:
        raise Refused("A rule is a Must or a Try to.")
    if level == tt_check.MUST:
        return None
    return int((settings.config(conn, WEIGHTS, {}, tenant=k["tenant_id"]) or {}).get(c.span or "", 1))


def _checked(conn: db.Conn, c: Change) -> None:
    """A limit's own words hold together, or it is refused before anything is written."""
    if c.span not in SPANS:
        raise Refused("A limit is for a day, a week or a fortnight.")
    if c.subject_code == tt_check.ANY:
        if c.span != "day":
            raise Refused(
                "A rule about every subject is for a day; a week's or a fortnight's count names its subject."
            )
    elif c.subject_code not in {h["code"] for h in tt_heads.heads(conn)}:
        raise Refused("That is not one of the school's subjects.")
    if c.span == "day" and c.fewest is not None:
        raise Refused("A day has a most, not a fewest.")
    if c.fewest is None and c.most is None:
        raise Refused("Give the fewest, the most, or both.")
    if any(n is not None and n < 0 for n in (c.fewest, c.most)):
        raise Refused("A number of lessons cannot be below zero.")
    if c.fewest is not None and c.most is not None and c.fewest > c.most:
        raise Refused("The fewest cannot be more than the most.")


def _limit(conn: db.Conn, k: dict, c: Change) -> None:
    if c.action == "remove":
        gone = conn.execute(
            "delete from timetable_rule where id::text = %s and school_class_id = %s and kind = 'limit' returning id",
            (c.id, k["id"]),
        ).fetchone()
        if gone is None:
            raise Refused("That limit is not there.", 404)
        return
    _checked(conn, c)
    old = conn.execute(
        f"select {_LIMIT} from timetable_rule where school_class_id = %s and kind = 'limit' and subject_code = %s and span = %s",  # noqa: S608
        (k["id"], c.subject_code, c.span),
    ).fetchone()
    conn.execute(
        "insert into timetable_rule (tenant_id, school_class_id, kind, subject_code, span, fewest, most, weight)"
        " values (%s, %s, 'limit', %s, %s, %s, %s, %s)"
        " on conflict (school_class_id, subject_code, span) where kind = 'limit'"
        " do update set fewest = excluded.fewest, most = excluded.most, weight = excluded.weight",
        (k["tenant_id"], k["id"], c.subject_code, c.span, c.fewest, c.most, _weight(conn, k, c, old)),
    )


def _away(conn: db.Conn, k: dict, c: Change, today: dt.date) -> None:
    mine = {e["staff_id"] for e in teaches(conn, k, today)}
    if c.action == "remove":
        gone = conn.execute(
            "delete from timetable_rule where id::text = %s and kind = 'away' and staff_id::text = any(%s) returning id",
            (c.id, list(mine)),
        ).fetchone()
        if gone is None:
            raise Refused("That rule is not there.", 404)
        return
    if c.staff_id not in mine:
        raise Refused("Choose one of this class's educators.")
    if c.weekday is None or not 1 <= c.weekday <= 5:
        raise Refused("Say which weekday, Monday to Friday.")
    if c.week_code not in (None, "A", "B"):
        raise Refused("Week A, week B, or both.")
    if not (c.reason or "").strip():
        raise Refused("Say why the educator is away.")
    if c.period_id:
        tt_rules._own_period(conn, {"grade": k["grade"]}, c.period_id)
    try:
        with conn.transaction():
            conn.execute(
                "insert into timetable_rule (tenant_id, kind, staff_id, weekday, week_code, period_id, reason)"
                " values (%s, 'away', %s, %s, %s, %s, %s)",
                (k["tenant_id"], c.staff_id, c.weekday, c.week_code, c.period_id, (c.reason or "").strip()),
            )
    except psycopg.errors.UniqueViolation as no:
        raise Refused("That is already a rule.", 409) from no


def change(
    conn: db.Conn, staff: Any, class_id: str | None, c: Change, today: dt.date, *, reason: str | None = None
) -> dict:
    """One rule changed, checked and kept with who changed it; a refusal writes nothing. What comes back is the rules as they now are."""
    if c.rule not in HERE:
        tt_rules.change(conn, staff, class_id, c, today, reason=reason)
        return read(conn, class_id, staff, today)
    if c.action not in ("set", "remove"):
        raise Refused("That is not a rule I know.")
    k = tt_pattern._class(conn, tt_rules.klass(conn, class_id)["id"])
    tt_pattern.guard(conn, staff, k["tenant_id"], today)
    with conn.transaction():
        history.by(conn, f"staff:{staff}")
        if c.rule == "limit":
            _limit(conn, k, c)
        else:
            _away(conn, k, c, today)
    return read(conn, k["id"], staff, today)
