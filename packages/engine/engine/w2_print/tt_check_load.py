"""CP-71: the checker on real rows (Done when 5 to 7). `world` reads a few classes' patterns as of a date, who teaches each subject, the
educators' absences and the classes' limits into the plain `tt_check.World`; `check` runs the pure checker and its fixes; `allow` is a
coordinator letting one Must problem stand, with a reason, kept as an approval row (kind `timetable_clash`, target = the problem's
`allow_key`, the same list and the same group as the clash an educator accepts). Who teaches: the open `subject_educator` grant of the class
for the subject; a subject lesson with none falls back to the class's class teacher, a specialist's does not (it is skipped, and said)."""

import datetime as dt
from typing import Any

from engine.core import db, subject_map
from engine.w2_print import tt_check as chk
from engine.w2_print import tt_check_fix as fix
from engine.w2_print import tt_clash, tt_heads, tt_live, tt_live_plan, tt_pattern
from engine.w2_print.tt_rules import Refused


def _grants(conn: db.Conn, ids: list[str], on: dt.date) -> list[dict]:
    return conn.execute(
        "select school_class_id::text as k, staff_id::text as staff, role_code, subject_code from staff_role_grant"
        " where school_class_id::text = any(%s) and role_code in ('subject_educator', 'class_teacher')"
        " and valid_from <= %s and (valid_to is null or valid_to >= %s)",
        (ids, on, on),
    ).fetchall()


def _educators(conn: db.Conn, ids: list[str], on: dt.date, listed: list[dict], tenant: Any) -> dict:
    """(class, head, cell kind) -> the one staff id who teaches it, or None (nobody named, or two named: no guess)."""
    spelled = subject_map.spellings(conn, tenant)
    grants = _grants(conn, ids, on)
    out: dict[tuple[str, str, str], str | None] = {}
    for k in ids:
        for h in listed:
            subjects = {spelled[g] for g in h["groups"] if g in spelled}
            named = {
                g["staff"]
                for g in grants
                if g["k"] == k and g["role_code"] == "subject_educator" and g["subject_code"] in subjects
            }
            teacher = {g["staff"] for g in grants if g["k"] == k and g["role_code"] == "class_teacher"}
            out[(k, h["code"], "specialist")] = next(iter(named)) if len(named) == 1 else None
            out[(k, h["code"], "subject")] = (
                next(iter(named or teacher)) if len(named or teacher) == 1 else None
            )
    return out


def world(conn: db.Conn, class_ids: list[str], on: dt.date) -> chk.World:
    rows = conn.execute(
        "select id::text as id, grade_code as grade, section, tenant_id::text as tenant from school_class where id::text = any(%s)",
        (class_ids,),
    ).fetchall()
    if len(rows) != len(set(class_ids)):
        raise Refused("That class is not there.", 404)
    ids = [r["id"] for r in rows]
    listed = tt_heads.heads(conn)
    periods: dict[str, dict] = {}
    class_periods: dict[str, list[str]] = {}
    cells: dict[chk.Place, dict] = {}
    for r in rows:
        got = tt_pattern.read(conn, r["id"], on)
        class_periods[r["id"]] = [p["id"] for p in got["periods"]]
        for p in got["periods"]:
            periods[p["id"]] = {
                "label": p["label"],
                "start": p["starts_at"],
                "end": p["ends_at"],
                "ord": p["ord"],
                "fixed": p["fixed"],
            }
        for c in got["cells"]:
            if c["cell"] != "empty":
                cells[(r["id"], c["period_id"], c["week"], c["weekday"])] = {
                    "cell": c["cell"],
                    "subject_code": c["subject_code"],
                    "text": c["text"],
                }
    away = [
        {"staff": a["staff"], "weekday": a["weekday"], "week": a["week_code"], "period_id": a["period_id"]}
        for a in conn.execute(
            "select staff_id::text as staff, weekday, week_code, period_id::text as period_id from timetable_rule"
            " where kind = 'away' and on_date is null"
        ).fetchall()
    ]
    for a in away:
        if a["period_id"] and a["period_id"] not in periods:
            p = db.one(
                conn,
                "select label, starts_at, ends_at, ord, fixed from period where id::text = %s",
                (a["period_id"],),
            )
            periods[a["period_id"]] = {"label": p["label"], "start": tt_pattern._hm(p["starts_at"]), "end": tt_pattern._hm(p["ends_at"]), "ord": p["ord"], "fixed": p["fixed"]}  # fmt: skip
    limits = [
        {"id": r["id"], "class": r["k"], "subject_code": r["subject_code"], "span": r["span"], "fewest": r["fewest"], "most": r["most"], "weight": r["weight"]}
        for r in conn.execute(
            "select id::text as id, school_class_id::text as k, subject_code, span, fewest, most, weight from timetable_rule"
            " where kind = 'limit' and school_class_id::text = any(%s)",
            (ids,),
        ).fetchall()
    ]  # fmt: skip
    allowed = {
        r["target"]
        for r in conn.execute(
            "select target from approval where kind = 'timetable_clash' and target like 'pat:%%'"
        ).fetchall()
    }
    return chk.World(
        {r["id"]: f"{r['grade']} {r['section']}" for r in rows}, periods, class_periods, cells,
        _educators(conn, ids, on, listed, rows[0]["tenant"]) if rows else {}, away, limits,
        {h["code"]: h["label"] for h in listed}, allowed,
    )  # fmt: skip


def classes_with_pattern(conn: db.Conn) -> list[str]:
    """Every class that has a pattern (a frame rule), the default of a check over the whole school."""
    return [
        r["id"]
        for r in conn.execute(
            "select c.id::text as id from school_class c where exists (select 1 from timetable_rule r where r.school_class_id = c.id"
            " and r.kind = 'frame') order by c.grade_code, c.section"
        ).fetchall()
    ]


def check(conn: db.Conn, class_ids: list[str], on: dt.date) -> dict:
    """Every problem of these classes' patterns as of `on`, each with its sentence and the fixes that were proven to work, whether any stops
    publishing, and the lessons the educator checks had to skip."""
    w = world(conn, class_ids, on)
    problems = fix.with_fixes(w, chk.check(w))
    return {
        "as_of": on.isoformat(),
        "problems": problems,
        "blocking": [p["key"] for p in chk.blocking(problems)],
        "notes": chk.unnamed(w),
        "counts": {
            "must": sum(p["level"] == chk.MUST for p in problems),
            "try": sum(p["level"] == chk.TRY for p in problems),
        },
    }


def allow(
    conn: db.Conn,
    staff: Any,
    class_ids: list[str],
    allow_key: str,
    reason: str | None,
    on: dt.date,
    *,
    today: dt.date,
) -> dict:
    """A Must problem of these classes stands, with a reason, as the coordinator who allowed it (the clash-accepting group)."""
    why = (reason or "").strip()
    if not why:
        raise Refused("Give a reason: an allowed problem is kept with why.")
    tenant = tt_pattern._class(conn, class_ids[0])["tenant_id"]
    try:
        tt_live.in_group(conn, tenant, staff, today, tt_clash.GROUP, "allow a problem")
    except tt_live_plan.Refused as no:
        raise Refused(str(no), 403) from no
    found = next((p for p in check(conn, class_ids, on)["problems"] if p["allow_key"] == allow_key), None)
    if found is None:
        raise Refused("That is not a problem of this timetable as it stands.", 404)
    if found["level"] != chk.MUST:
        raise Refused("A Try to is never blocking: there is nothing to allow.")
    if found["allowed"]:
        raise Refused("That problem is allowed already.")
    with conn.transaction():
        conn.execute(
            "insert into approval (tenant_id, kind, target, decision, by, reason, detail, created_at) values (%s, 'timetable_clash', %s,"
            " 'accept', %s, %s, jsonb_build_object('source', 'pattern', 'sentence', %s::text), clock_timestamp())",
            (tenant, allow_key, str(staff), why, found["sentence"]),
        )
    return {"allowed": allow_key, "sentence": found["sentence"]}
