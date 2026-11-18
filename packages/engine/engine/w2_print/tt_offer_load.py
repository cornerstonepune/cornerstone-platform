"""CP-74: the picker's rows (specs/CP-74/spec.md; design D). `world` reads, for one lesson's class and subject, what the pure `tt_offer` and
`tt_fill` take: the grade's objectives of the subject (with `one_off` from the setting `timetable.one_off_units`, words a one-off unit's name
holds), the class's lessons of the subject, how many of the grade's activities each objective has, and whether a coordinator has said the
subject's order is right (an `approval` row of kind `objective_order`, target `<grade>~<subject>`; without it the whole subject is offered).
`offers` is the picker's read: the tiers, the lesson's own choice, and the activities linked to its objective. `check_order` is the
coordinator's yes. Code decides; no model, no name."""

from typing import Any

from engine.core import db, settings, subject_map
from engine.w2_print import educator_gate as gate
from engine.w2_print import tt_edit, tt_heads, tt_live, tt_offer
from engine.w2_print.tt_live_plan import Refused

ONE_OFF = "timetable.one_off_units"
ORDER = "objective_order"


def ordered(conn: db.Conn, tenant: Any, grade: str, subject: str) -> bool:
    """Whether the newest word on the subject's order, by a coordinator, is yes."""
    last = conn.execute(
        "select decision from approval where tenant_id = %s and kind = %s and target = %s order by seq desc limit 1",
        (tenant, ORDER, f"{grade}~{subject}"),
    ).fetchone()
    return last is not None and last["decision"] == "approved"


def check_order(
    conn: db.Conn, who: Any, grade: str, subject: str, *, yes: bool = True, reason: str | None = None
) -> dict:
    """A coordinator says the subject's teaching order is right (or takes that back). One approval row; nothing else changes."""
    tenant = db.one(conn, "select tenant_id from staff where id = %s", (who,))["tenant_id"]
    tt_live.in_group(conn, str(tenant), who, gate.school_today(conn), what="say a subject's order is right")
    if db.one(conn, "select count(*) as n from learning_objective where tenant_id = %s and band = %s and subject_code = %s", (tenant, grade, subject))["n"] == 0:  # fmt: skip
        raise Refused(f"{grade} has no objectives in '{subject}'.")
    if ordered(conn, tenant, grade, subject) == yes:  # already so: no second row
        return {"grade": grade, "subject": subject, "ordered": yes}
    conn.execute(
        "insert into approval (tenant_id, kind, target, decision, reason, by) values (%s, %s, %s, %s, %s, %s)",
        (
            tenant,
            ORDER,
            f"{grade}~{subject}",
            "approved" if yes else "withdrawn",
            (reason or "").strip() or None,
            str(who),
        ),
    )
    return {"grade": grade, "subject": subject, "ordered": yes}


def objectives(conn: db.Conn, tenant: Any, grade: str, subjects: list[str]) -> list[dict]:
    """The grade's objectives of the subject as `tt_offer` takes them. One with no order yet sorts after the rest, by its code."""
    words = [str(w).lower() for w in settings.config(conn, ONE_OFF, [], tenant=str(tenant)) or []]
    rows = conn.execute(
        "select code, unit, title, ord, retired from learning_objective where tenant_id = %s and subject_code = any(%s)"
        " and (band = %s or %s = any(also_bands)) order by ord nulls last, code",
        (tenant, subjects, grade, grade),
    ).fetchall()
    last = max((r["ord"] or 0 for r in rows), default=0)
    return [
        {**r, "unit": r["unit"] or "", "ord": r["ord"] if r["ord"] is not None else last + n + 1,
         "one_off": any(w in (r["unit"] or "").lower() for w in words)}
        for n, r in enumerate(rows)
    ]  # fmt: skip


def lessons(conn: db.Conn, s: dict, subjects: list[str]) -> list[dict]:
    """The class's lessons of the subject, this year, as `tt_offer` and `tt_fill` take them."""
    heads = tt_heads.heads_in(tt_heads.heads(conn), subject_map.spellings(conn, s["tenant_id"]), subjects)
    return conn.execute(
        "select x.id::text as id, d.on_date, x.period_id::text as period_id, to_char(p.starts_at, 'HH24:MI') as starts, x.state,"
        " d.kind = 'holiday' as holiday, (x.kind = 'fixed' or p.fixed) as fixed, x.lo_code, x.activity_code, x.source"
        " from session x join school_day d on d.id = x.school_day_id join period p on p.id = x.period_id"
        " where x.school_class_id = %s and x.subject_code = any(%s) order by d.on_date, p.starts_at",
        (s["school_class_id"], sorted(heads)),
    ).fetchall()


def activity_counts(conn: db.Conn, tenant: Any, grade: str) -> dict[str, int]:
    return {
        r["lo_code"]: r["n"]
        for r in conn.execute(
            "select o.lo_code, count(*)::int as n from activity_objective o join activity a on a.tenant_id = o.tenant_id"
            " and a.code = o.activity_code where o.tenant_id = %s and (a.band = %s or %s = any(a.also_bands)) group by o.lo_code",
            (tenant, grade, grade),
        ).fetchall()
    }


def world(conn: db.Conn, s: dict) -> dict:
    """Everything the pure functions take for the lesson's class and subject; `subjects` empty when its head teaches none."""
    subjects = tt_heads.subjects_of(conn, s)
    if not subjects:
        return {"subjects": [], "objectives": [], "lessons": [], "activities": {}, "ordered": False}
    return {
        "subjects": subjects,
        "objectives": objectives(conn, s["tenant_id"], s["grade_code"], subjects),
        "lessons": lessons(conn, s, subjects),
        "activities": activity_counts(conn, s["tenant_id"], s["grade_code"]),
        "ordered": all(ordered(conn, s["tenant_id"], s["grade_code"], code) for code in subjects),
    }


def linked(conn: db.Conn, s: dict, lo_code: str | None) -> list[dict]:
    """The grade's activities linked to an objective, in the links' own order."""
    if not lo_code:
        return []
    return conn.execute(
        "select a.code, a.name, a.strand from activity_objective o join activity a on a.tenant_id = o.tenant_id"
        " and a.code = o.activity_code where o.tenant_id = %s and o.lo_code = %s and (a.band = %s or %s = any(a.also_bands))"
        " order by o.ord, a.name",
        (s["tenant_id"], lo_code, s["grade_code"], s["grade_code"]),
    ).fetchall()


def offers(
    conn: db.Conn, session_id: str, *, who: Any, lo_code: str | None = None, today: Any = None
) -> dict:
    """What the lesson is offered: `tt_offer.offers` for its class and subject, its own objective and activity, who chose
    them, and the activities linked to `lo_code` (default: the lesson's objective, else what is next up). Reads only; for the
    coordinators and the educator who holds the class (`tt_edit.may`)."""
    s = tt_edit.lesson(conn, str(session_id))
    tt_edit.may(conn, s, who, gate.school_today(conn), choice_only=True, what="choose what a lesson teaches")
    today = today or gate.school_today(conn)
    w = world(conn, s)
    out = tt_offer.offers(w["objectives"], w["lessons"], w["activities"], today, ordered=w["ordered"])
    shown = lo_code or s["lo_code"] or (out["next_up"] or {}).get("code")
    titles = {o["code"]: o["title"] for o in w["objectives"]}
    return {
        **out,
        "session_id": str(s["id"]), "on_date": s["on_date"], "subjects": w["subjects"], "ordered": w["ordered"],
        "lo_code": s["lo_code"], "lo_title": titles.get(s["lo_code"]), "activity_code": s["activity_code"], "source": s["source"],
        "activities_for": shown, "activities": linked(conn, s, shown),
    }  # fmt: skip
