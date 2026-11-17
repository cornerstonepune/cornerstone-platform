"""CP-74: many lessons written at once (specs/CP-74/spec.md Done when 4 to 7; design D5). The arithmetic is `tt_fill`'s (pure); this file
reads the rows, asks who may, and writes.

- `fill(…, mode)` from one lesson of a class and subject: `same_as_last_week` (that lesson), `spread` (a unit's objectives not yet taught, or a
  given list, over the subject's lessons of that lesson's fortnight from today on) and `list` (the lessons and objectives as given, e.g. a
  spread she adjusted). `dry` shows the answer and writes nothing. Each write is `tt_edit.edit`: her choice, marked `person`, with its
  history row and every check a single edit has; one refusal writes nothing at all.
- `suggest(conn)`: the nightly job. For every class and subject with a checked order and something taught, the lessons still to come that are
  empty or machine-made get the next objectives in order, marked `machine`. A person's lesson is never written. Run twice, the second run
  writes nothing. It first gives an order to any objective that has none (`order_missing`), after the rest of its unit.
Code decides; no model, no name."""

from typing import Any

from psycopg.types.json import Jsonb

from engine.core import db
from engine.w2_print import educator_gate as gate
from engine.w2_print import tt_edit, tt_fill, tt_heads, tt_offer
from engine.w2_print import tt_offer_load as load
from engine.w2_print.tt_live_plan import Refused

MODES = ("same_as_last_week", "spread", "list")
ORIGIN = "engine:timetable-suggest"


def _fortnight_lessons(conn: db.Conn, s: dict, lessons: list[dict], today: Any) -> list[dict]:
    """The subject's lessons in the lesson's own fortnight, from today on, still planned."""
    f = conn.execute(
        "select starts_on, ends_on from fortnight where academic_year_id = %s and kind = 'teaching' and %s between starts_on and ends_on",
        (s["academic_year_id"], s["on_date"]),
    ).fetchone()
    if f is None:
        raise Refused(f"{s['on_date']} is in no teaching fortnight.")
    return [
        x
        for x in lessons
        if f["starts_on"] <= x["on_date"] <= f["ends_on"]
        and x["on_date"] >= today
        and x["state"] == "planned"
    ]


def _unit_left(w: dict, unit: str, today: Any) -> list[str]:
    done = tt_offer.taught(w["lessons"], today)
    codes = [o["code"] for o in tt_offer.live(w["objectives"]) if o["unit"] == unit and o["code"] not in done]
    if not codes:
        raise Refused(f"'{unit}' has no objective left to teach.")
    return codes


def _plan(
    conn: db.Conn,
    s: dict,
    w: dict,
    today: Any,
    mode: str,
    unit: str | None,
    codes: list[str] | None,
    items: list[dict] | None,
) -> dict:
    if mode == "same_as_last_week":
        got = tt_fill.same_as_last_week(
            next(x for x in w["lessons"] if x["id"] == str(s["id"])), w["lessons"], subject=tt_heads.label_of(tt_heads.heads(conn), s["subject_code"])
        )  # fmt: skip
        return {
            "lessons": [
                {"id": str(s["id"]), "lo_code": got["lo_code"], "activity_code": got["activity_code"]}
            ],
            "left_over": [],
            "skipped": [],
        }
    mine = _fortnight_lessons(conn, s, w["lessons"], today)
    if mode == "spread":
        return tt_fill.spread(codes or _unit_left(w, unit or "", today), mine)
    known = {x["id"] for x in mine}
    stray = [i["id"] for i in items or [] if i["id"] not in known]
    if stray or not items:
        raise Refused("Give lessons of this class and subject in this fortnight, each with its objective.")
    return {
        "lessons": [{"id": i["id"], "lo_code": i["lo_code"]} for i in items],
        "left_over": [],
        "skipped": [],
    }


def fill(
    conn: db.Conn, session_id: str, *, who: Any, mode: str, unit: str | None = None, codes: list[str] | None = None,
    items: list[dict] | None = None, dry: bool = False, reason: str | None = None, today: Any = None,
) -> dict:  # fmt: skip
    """Plan (and, unless `dry`, write) the objectives of several lessons of one class and subject, as `who`."""
    if mode not in MODES:
        raise Refused(f"'{mode}' is not a way to fill lessons; use one of {', '.join(MODES)}.")
    s = tt_edit.lesson(conn, str(session_id))
    tt_edit.may(conn, s, who, gate.school_today(conn), choice_only=True, what="choose what a lesson teaches")
    today = today or gate.school_today(conn)
    w = load.world(conn, s)
    plan = _plan(conn, s, w, today, mode, unit, codes, items)
    now = {x["id"]: x for x in w["lessons"]}
    titles = {o["code"]: o["title"] for o in w["objectives"]}
    written = 0
    if not dry:
        with conn.transaction():
            for p in plan["lessons"]:
                same_activity = (
                    "activity_code" not in p or p["activity_code"] == now[p["id"]]["activity_code"]
                )
                if p["lo_code"] == now[p["id"]]["lo_code"] and same_activity:
                    continue
                tt_edit.edit(
                    conn,
                    p["id"],
                    who=who,
                    lo_code=p["lo_code"] or "",
                    activity_code=p.get("activity_code"),
                    reason=reason,
                )
                written += 1
    return {
        "mode": mode, "dry": dry, "written": written,
        "lessons": [{**p, "on_date": now[p["id"]]["on_date"], "starts": now[p["id"]]["starts"], "title": titles.get(p["lo_code"])} for p in plan["lessons"]],
        "left_over": [{"code": c, "title": titles.get(c)} for c in plan["left_over"]],
        "skipped": [{"id": i, "on_date": now[i]["on_date"], "holiday": now[i]["holiday"]} for i in plan["skipped"]],
    }  # fmt: skip


def order_missing(conn: db.Conn) -> int:
    """Give every objective with no order one, after the last of its unit (a new unit: after the last of its grade and subject, ten on).
    Machine-made, and only where there is none, so a second run changes nothing."""
    rows = conn.execute(
        "select l.tenant_id, l.code, l.band, l.subject_code, l.unit,"
        " (select max(o.ord) from learning_objective o where o.tenant_id = l.tenant_id and o.band is not distinct from l.band"
        "   and o.subject_code is not distinct from l.subject_code and o.unit is not distinct from l.unit) as unit_last,"
        " (select coalesce(max(o.ord), 0) from learning_objective o where o.tenant_id = l.tenant_id and o.band is not distinct from l.band"
        "   and o.subject_code is not distinct from l.subject_code) as subject_last"
        " from learning_objective l where l.ord is null order by l.tenant_id, l.band, l.subject_code, l.code"
    ).fetchall()
    last: dict[tuple, int] = {}
    for r in rows:
        subject = (r["tenant_id"], r["band"], r["subject_code"])
        unit = (*subject, r["unit"])
        if unit not in last and r["unit_last"] is None:
            last[unit] = max(last.get(subject, r["subject_last"]), r["subject_last"]) + 10
        else:
            last[unit] = last.get(unit, r["unit_last"] or 0) + 1
        last[subject] = max(last.get(subject, 0), last[unit])
        conn.execute("update learning_objective set ord = %s where tenant_id = %s and code = %s and ord is null", (last[unit], r["tenant_id"], r["code"]))  # fmt: skip
    return len(rows)


def suggest(conn: db.Conn, *, today: Any = None) -> dict:
    """The nightly suggestion job, for every class with lessons still to come. Returns how many lessons it wrote."""
    today = today or gate.school_today(conn)
    placed = order_missing(conn)
    firsts = conn.execute(
        "select distinct on (x.school_class_id, x.subject_code) x.id::text as id from session x join school_day d on d.id = x.school_day_id"
        " where d.on_date >= %s and x.kind <> 'fixed' and x.subject_code is not null order by x.school_class_id, x.subject_code, d.on_date",
        (today,),
    ).fetchall()
    seen: set[tuple] = set()
    written = 0
    for first in firsts:
        s = tt_edit.lesson(conn, first["id"])
        w = load.world(conn, s)
        key = (str(s["school_class_id"]), *w["subjects"])
        if not w["subjects"] or key in seen:
            continue
        seen.add(key)
        for change in tt_fill.suggest(w["objectives"], w["lessons"], today, ordered=w["ordered"]):
            old = next(x for x in w["lessons"] if x["id"] == change["id"])
            done = conn.execute(
                "update session set lo_code = %s, source = 'machine', updated_at = now() where id = %s"
                " and source = 'machine' and (lo_code is not null or activity_code is null) returning tenant_id",
                (change["lo_code"], change["id"]),
            ).fetchone()
            if done is None:
                continue
            conn.execute(
                "insert into change_log (tenant_id, table_name, row_id, op, before, after, origin) values (%s, 'session', %s, 'suggest', %s, %s, %s)",
                (
                    done["tenant_id"],
                    change["id"],
                    Jsonb({"lo_code": old["lo_code"]}),
                    Jsonb({"lo_code": change["lo_code"]}),
                    ORIGIN,
                ),
            )
            written += 1
    return {"written": written, "ordered_now": placed}
