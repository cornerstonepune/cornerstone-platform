"""CP-22: a placed draft (CP-11's `timetable_run`) goes live for one class and one fortnight (specs/CP-22/design.md).

A live fortnight is a layer of dated `timetable_slot` rows (`fortnight_id` set, valid for one date each) over the standing
frame, which is never touched; the day page prefers the layer. Sessions already planned on the frame's subject cells move
to the draft's lessons of their subject and week in plan order, keeping their id, plan line, text and materials links
(whose dates follow). Every check runs before any write; a refusal names its reason and the lessons it stops on, and writes
nothing. `dry` works everything out and writes nothing. Code decides everything here; no model, no name."""

import datetime as dt
import hashlib
import json
from dataclasses import dataclass
from typing import Any

from engine.core import db, settings
from engine.w2_print import educator_gate as gate
from engine.w2_print import fortnight_cycle as fc
from engine.w2_print import tt_generate as gen
from engine.w2_print import tt_live_plan as sessions_plan
from engine.w2_print import tt_need as need
from engine.w2_print.tt_live_plan import Plan, Refused

GROUP = "timetable.go_live_group"  # the access group (CP-3) whose members may put a draft live


@dataclass
class Report:
    number: int
    starts_on: dt.date
    ends_on: dt.date
    dates: list[dt.date]
    lessons: dict[dt.date, int]
    plan: Plan
    dry: bool
    discarded: bool

    def lines(self) -> list[str]:
        head = "trial run: nothing was written" if self.dry else "went live"
        out = [f"fortnight {self.number} ({self.starts_on} to {self.ends_on}): {head}"]
        for d in self.dates:
            moved = sum(1 for _, (day, _) in self.plan.moves if day == d)
            gone = sum(1 for s in self.plan.removed if s["on_date"] == d)
            out.append(
                f"  {d}: {self.lessons.get(d, 0)} lessons, {moved} sessions moved here, {gone} removed"
            )
        lines = [s["line"] or s["text"] for s in self.plan.removed if s["line"] or s["text"]]
        out.append("  plan lines with no lesson this fortnight: " + ("; ".join(lines) or "none"))
        if self.discarded:
            out.append("  changes made by hand since the fortnight last went live were discarded")
        return out


# ---- the checks ------------------------------------------------------------------------------------------------------


def in_group(
    conn: db.Conn, tenant: str, who: Any, today: dt.date, key: str = GROUP, what: str = "put a draft live"
) -> None:
    """Refuse unless `who` holds a current grant in the access group the school's setting `key` names (CP-12 asks it
    of `timetable.accept_clash_group`)."""
    group = str(settings.config(conn, key, "everything", tenant=tenant))
    held = conn.execute(
        "select 1 from staff_role_grant g join role r on r.tenant_id = g.tenant_id"
        " and r.code = g.role_code where g.tenant_id = %s and g.staff_id = %s and r.access_group = %s"
        " and g.valid_from <= %s and (g.valid_to is null or g.valid_to > %s)",
        (tenant, who, group, today, today),
    ).fetchone()
    if held is None:
        raise Refused(f"only the '{group}' group may {what} ({key}); this person is not in it.")


def _run(conn: db.Conn, i: need.Inputs, run_id: Any) -> dict:
    row = conn.execute("select * from timetable_run where id = %s", (run_id,)).fetchone()
    if row is None:
        raise Refused("no draft has that id.")
    if str(row["school_class_id"]) != i.class_id or str(row["fortnight_id"]) != i.fortnight_id:
        raise Refused("that draft is for another class or fortnight.")
    if row["outcome"] != "placed":
        raise Refused(f"the draft did not place every lesson (outcome: {row['outcome']}); make a new one.")
    if gen.input_text(i, row["fet_version"] or "") != row["input_text"]:
        raise Refused(
            "the rules changed since this draft was made (a block, a limit, a fixed slot or a holiday); make a new draft."
        )
    return row


def _school_days(conn: db.Conn, i: need.Inputs) -> dict[dt.date, Any]:
    found = {
        r["on_date"]: r["id"]
        for r in conn.execute(
            "select d.id, d.on_date from school_day d join school_class c on c.campus_id = d.campus_id"
            " where c.id = %s and d.on_date = any(%s)",
            (i.class_id, [d.date for d in i.days]),
        ).fetchall()
    }
    missing = [d.date.isoformat() for d in i.days if d.date not in found]
    if missing:
        raise Refused("no school day on record for these dates; add them to the calendar first:", missing)
    return found


def _hash(conn: db.Conn, i: need.Inputs, fn: dict) -> str:
    """The fortnight as it stands: its layer rows and its sessions, so a later go-live sees a hand change."""
    layer = conn.execute(
        "select valid_from::text as d, period_id::text as p, kind, subject_code, text from timetable_slot"
        " where school_class_id = %s and fortnight_id = %s order by 1, 2",
        (i.class_id, i.fortnight_id),
    ).fetchall()
    sessions = conn.execute(
        "select s.id::text as id, d.on_date::text as d, s.period_id::text as p, s.plan_entry_id::text as pe, s.state,"
        " s.text from session s join school_day d on d.id = s.school_day_id"
        " where s.school_class_id = %s and d.on_date between %s and %s order by 2, 3",
        (i.class_id, fn["starts_on"], fn["ends_on"]),
    ).fetchall()
    return hashlib.sha256(
        json.dumps([[dict(r) for r in layer], [dict(r) for r in sessions]]).encode()
    ).hexdigest()


# ---- the layer and the writes -----------------------------------------------------------------------------------------


def _layer(conn: db.Conn, i: need.Inputs, draft: list[dict]) -> list[tuple]:
    """One row per teaching date and period: the draft's lesson, else the frame's fixed or specialist cell, else empty
    (with a block's reason as its text)."""
    frame = {
        (r["week_code"], r["weekday"], r["period_id"]): (r["kind"], r["subject_code"], r["text"])
        for r in conn.execute(
            "select week_code, weekday, period_id::text as period_id, kind, subject_code, text from timetable_slot"
            " where school_class_id = %s and valid_to is null",
            (i.class_id,),
        ).fetchall()
    }
    words = {subj: text for kind, subj, text in frame.values() if kind == "subject" and subj}
    lesson_at = {(dt.date.fromisoformat(e["date"]), str(e["period_id"])): e["subject_code"] for e in draft}
    rows = []
    for d in i.days:
        for p in i.periods:
            cell = frame.get((d.week, d.date.isoweekday(), p["id"]), ("empty", None, ""))
            if subject := lesson_at.get((d.date, p["id"])):
                cell = ("subject", subject, words.get(subject, subject))
            elif cell[0] not in ("fixed", "specialist"):
                cell = ("empty", None, "; ".join(b["reason"] for b in need.blocked(i, d, p["id"])))
            rows.append(
                (
                    i.tenant_id,
                    i.class_id,
                    p["id"],
                    d.week,
                    d.date.isoweekday(),
                    *cell,
                    d.date,
                    d.date,
                    i.fortnight_id,
                )
            )
    return rows


def _write(conn: db.Conn, i: need.Inputs, layer: list[tuple], plan: Plan, days: dict[dt.date, Any]) -> None:
    """The session key is immediate, so sessions that change place are taken out together (with their materials links,
    which the delete would cascade) and put back at the same id in their new cells."""
    conn.execute(
        "delete from timetable_slot where school_class_id = %s and fortnight_id = %s",
        (i.class_id, i.fortnight_id),
    )
    moving = [s["id"] for s, _ in plan.moves]
    held = conn.execute(
        "select s.id, s.tenant_id, s.school_class_id, s.subject_code, s.led_by_staff_id, s.state, s.planned,"
        " s.plan_entry_id, s.text from session s where s.id = any(%s)",
        (moving,),
    ).fetchall()
    links = conn.execute(
        "select line_id, session_id, activity_code, quantity from materials_line_source where session_id = any(%s)",
        (moving,),
    ).fetchall()
    where = {s["id"]: cell for s, cell in plan.moves}
    new_date = {(line, sid): new for line, sid, new in plan.materials}
    old_date = {
        (r["line_id"], r["session_id"]): r["on_date"]
        for r in conn.execute(
            "select line_id, session_id, on_date from materials_line_source where session_id = any(%s)",
            (moving,),
        ).fetchall()
    }
    with conn.cursor() as cur:
        cur.executemany(
            "insert into timetable_slot (tenant_id, school_class_id, period_id, week_code, weekday, kind, subject_code,"
            " text, valid_from, valid_to, fortnight_id) values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
            layer,
        )
        cur.executemany(
            "delete from session where id = %s", [(x,) for x in [*moving, *(s["id"] for s in plan.removed)]]
        )
        cur.executemany(
            "insert into session (id, tenant_id, school_class_id, school_day_id, period_id, subject_code,"
            " led_by_staff_id, state, planned, plan_entry_id, text) values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
            [
                (h["id"], h["tenant_id"], h["school_class_id"], days[where[h["id"]][0]], where[h["id"]][1],
                 h["subject_code"], h["led_by_staff_id"], h["state"], h["planned"], h["plan_entry_id"], h["text"])
                for h in held
            ],
        )  # fmt: skip
        cur.executemany(
            "insert into materials_line_source (line_id, session_id, activity_code, on_date, quantity)"
            " values (%s, %s, %s, %s, %s)",
            [
                (r["line_id"], r["session_id"], r["activity_code"],
                 new_date.get((r["line_id"], r["session_id"]), old_date[(r["line_id"], r["session_id"])]), r["quantity"])
                for r in links
            ],
        )  # fmt: skip
        cur.executemany(
            "update materials_line set needed_on = %s where id = %s",
            [(new, line) for line, _, new in plan.materials],
        )


def go_live(
    conn: db.Conn, grade: str, section: str, year: str, number: int, *, run_id: Any, who: Any,
    reason: str | None = None, discard: bool = False, dry: bool = False,
) -> Report:  # fmt: skip
    """Put the draft `run_id` live for the class and fortnight, as `who` (a staff id). Raises `Refused` (nothing
    written) when a check fails; `need.NoSuchFortnight` when the class or fortnight is not there."""
    i = need.load(conn, grade, section, year, number)
    conn.execute("select pg_advisory_xact_lock(hashtext(%s), hashtext(%s))", (i.tenant_id, i.class_id))
    today = gate.school_today(conn)
    in_group(conn, i.tenant_id, who, today)
    fn = db.one(conn, "select starts_on, ends_on from fortnight where id = %s", (i.fortnight_id,))
    run = _run(conn, i, run_id)
    if fn["starts_on"] <= today:
        raise Refused(
            f"fortnight {number} has already started ({fn['starts_on']}); a fortnight under way is changed by hand."
        )
    days = _school_days(conn, i)
    if fc.is_frozen(conn, i.tenant_id, fn["starts_on"]) and not (reason or "").strip():
        raise Refused(f"fortnight {number} is frozen: give a reason (--reason) to put a draft live in it.")
    last = conn.execute(
        "select state_hash from timetable_live where school_class_id = %s and fortnight_id = %s order by at desc limit 1",
        (i.class_id, i.fortnight_id),
    ).fetchone()
    changed = last is not None and _hash(conn, i, fn) != last["state_hash"]
    if changed and not discard:
        raise Refused(
            "this fortnight was changed since it went live; say --discard-changes to overwrite those changes."
        )
    plan = sessions_plan.plan(conn, i, fn, run["draft"])
    layer = _layer(conn, i, run["draft"])
    lessons: dict[dt.date, int] = {}
    for e in run["draft"]:
        d = dt.date.fromisoformat(e["date"])
        lessons[d] = lessons.get(d, 0) + 1
    report = Report(
        number, fn["starts_on"], fn["ends_on"], [d.date for d in i.days], lessons, plan, dry, changed
    )
    if dry:
        return report
    fc.ensure_editable(
        conn,
        [i.fortnight_id],
        reason=reason,
        table="timetable_slot",
        record_id=i.class_id,
        op="update",
        actor=who,
    )
    _write(conn, i, layer, plan, days)
    conn.execute(
        "insert into timetable_live (tenant_id, school_class_id, fortnight_id, run_id, state_hash, discarded, reason, who)"
        " values (%s, %s, %s, %s, %s, %s, %s, %s)",
        (i.tenant_id, i.class_id, i.fortnight_id, run["id"], _hash(conn, i, fn), changed, reason, who),
    )
    return report
