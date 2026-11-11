"""CP-22: a placed draft (CP-11's `timetable_run`) goes live for one class and one fortnight (specs/CP-22/design.md).

The timetable of a date is its lessons (`session`, CP-27): the frame is never touched. The fortnight's planned subject
lessons move to the draft's lessons of their subject and week in plan order, keeping their id, plan line, text and
materials links (whose dates follow); a draft lesson no session takes is a new lesson in the frame's words for its subject,
and a fortnight that had no lessons gets the frame's fixed and specialists' lessons too. Who put which draft live, and the
fortnight as it was written, is an approval row (kind `timetable_live`). Every check runs before any write; a refusal
names its reason and the lessons it stops on, and writes
nothing. `dry` works everything out and writes nothing. Code decides everything here; no model, no name."""

import datetime as dt
import hashlib
import json
from dataclasses import dataclass
from typing import Any

from engine.core import db, settings
from engine.w2_print import educator_gate as gate
from engine.w2_print import fortnight_cycle as fc
from engine.w2_print import materials_list
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
    added: int = 0  # lessons the draft had that no session took: new lessons

    def changes(self) -> dict:
        """What the site shows after a go-live: every session moved and every lesson removed, as ids, subjects and dates
        (no person), the new lessons as a number, and each date's counts as `lines()` words them."""
        return {
            "number": self.number, "starts_on": self.starts_on, "ends_on": self.ends_on, "dry": self.dry,
            "discarded": self.discarded, "added": self.added,
            "moved": [
                {"session": str(s["id"]), "subject": s["subject_code"], "from_date": s["on_date"], "to_date": day,
                 "to_period": period}
                for s, (day, period) in self.plan.moves
            ],
            "removed": [
                {"session": str(s["id"]), "subject": s["subject_code"], "date": s["on_date"]} for s in self.plan.removed
            ],
            "days": [
                {"date": d, "lessons": self.lessons.get(d, 0),
                 "moved_here": sum(1 for _, (day, _p) in self.plan.moves if day == d),
                 "removed": sum(1 for s in self.plan.removed if s["on_date"] == d)}
                for d in self.dates
            ],
            "lines_without_lesson": [s["line"] or s["text"] for s in self.plan.removed if s["line"] or s["text"]],
        }  # fmt: skip

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
    """The fortnight as it stands, its lessons, so a later go-live sees a hand change."""
    sessions = conn.execute(
        "select s.id::text as id, d.on_date::text as d, s.period_id::text as p, s.kind, s.subject_code,"
        " s.plan_entry_id::text as pe, s.state, s.text from session s join school_day d on d.id = s.school_day_id"
        " where s.school_class_id = %s and d.on_date between %s and %s order by 2, 3",
        (i.class_id, fn["starts_on"], fn["ends_on"]),
    ).fetchall()
    return hashlib.sha256(json.dumps([dict(r) for r in sessions]).encode()).hexdigest()


# ---- the writes ---------------------------------------------------------------------------------------------------


def _new_lessons(conn: db.Conn, i: need.Inputs, fn: dict, draft: list[dict], plan: Plan) -> list[tuple]:
    """The lessons the fortnight is short of once the plan's moves are made: a draft lesson no session takes (in the
    frame's words for its subject), and, for a fortnight that had no lessons, the frame's fixed and specialists' cells."""
    frame = {
        (r["week_code"], r["weekday"], r["period_id"]): (r["cell"], r["subject_code"], r["text"])
        for r in conn.execute(
            "select week_code, weekday, period_id::text as period_id, cell, subject_code, text from timetable_rule"
            " where school_class_id = %s and kind = 'frame' and valid_to is null",
            (i.class_id,),
        ).fetchall()
    }
    words = {subj: text for kind, subj, text in frame.values() if kind == "subject" and subj}
    held = {
        (r["on_date"], r["period_id"])
        for r in conn.execute(
            "select d.on_date, s.period_id::text as period_id from session s join school_day d on d.id = s.school_day_id"
            " where s.school_class_id = %s and d.on_date between %s and %s",
            (i.class_id, fn["starts_on"], fn["ends_on"]),
        ).fetchall()
    }
    gone = {(s["on_date"], s["period_id"]) for s, _ in plan.moves} | {
        (s["on_date"], s["period_id"]) for s in plan.removed
    }
    taken = (held - gone) | {cell for _, cell in plan.moves}
    rows = []
    for e in draft:
        cell = (dt.date.fromisoformat(e["date"]), str(e["period_id"]))
        if cell not in taken:
            rows.append(
                (*cell, "subject", e["subject_code"], words.get(e["subject_code"], e["subject_code"]))
            )
    if not held:
        for d in i.days:
            for p in i.periods:
                kind, subject, text = frame.get((d.week, d.date.isoweekday(), p["id"]), ("empty", None, ""))
                if kind in ("fixed", "specialist"):
                    rows.append((d.date, p["id"], kind, subject, text))
    return rows


def _write(conn: db.Conn, i: need.Inputs, new: list[tuple], plan: Plan, days: dict[dt.date, Any]) -> None:
    """The session key is immediate, so sessions that change place are taken out together (with their materials links,
    which the delete would cascade) and put back at the same id in their new cells; then the lessons it is short of."""
    moving = [s["id"] for s, _ in plan.moves]
    held = conn.execute(
        "select s.id, s.tenant_id, s.school_class_id, s.subject_code, s.kind, s.led_by_staff_id, s.state, s.planned,"
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
            "delete from session where id = %s", [(x,) for x in [*moving, *(s["id"] for s in plan.removed)]]
        )
        cur.executemany(
            "insert into session (id, tenant_id, school_class_id, school_day_id, period_id, subject_code, kind,"
            " led_by_staff_id, state, planned, plan_entry_id, text) values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
            [
                (h["id"], h["tenant_id"], h["school_class_id"], days[where[h["id"]][0]], where[h["id"]][1],
                 h["subject_code"], h["kind"], h["led_by_staff_id"], h["state"], h["planned"], h["plan_entry_id"], h["text"])
                for h in held
            ],
        )  # fmt: skip
        cur.executemany(
            "insert into session (tenant_id, school_class_id, school_day_id, period_id, kind, subject_code, text)"
            " values (%s, %s, %s, %s, %s, %s, %s)",
            [(i.tenant_id, i.class_id, days[d], p, kind, subject, text) for d, p, kind, subject, text in new],
        )
        cur.executemany(
            materials_list.ADD_SOURCE,
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
        "select detail ->> 'state_hash' as state_hash from approval where kind = 'timetable_live' and target = %s"
        " order by seq desc limit 1",
        (f"{i.class_id} {i.fortnight_id}",),
    ).fetchone()
    changed = last is not None and _hash(conn, i, fn) != last["state_hash"]
    if changed and not discard:
        raise Refused(
            "this fortnight was changed since it went live; say --discard-changes to overwrite those changes."
        )
    plan = sessions_plan.plan(conn, i, fn, run["draft"])
    new = _new_lessons(conn, i, fn, run["draft"], plan)
    lessons: dict[dt.date, int] = {}
    for e in run["draft"]:
        d = dt.date.fromisoformat(e["date"])
        lessons[d] = lessons.get(d, 0) + 1
    report = Report(
        number,
        fn["starts_on"],
        fn["ends_on"],
        [d.date for d in i.days],
        lessons,
        plan,
        dry,
        changed,
        len(new),
    )
    if dry:
        return report
    fc.ensure_editable(
        conn,
        [i.fortnight_id],
        reason=reason,
        table="session",
        record_id=i.class_id,
        op="update",
        actor=who,
    )
    _write(conn, i, new, plan, days)
    conn.execute(
        "insert into approval (tenant_id, kind, target, decision, by, reason, detail, created_at) values (%s,"
        " 'timetable_live', %s, 'go_live', %s, %s, jsonb_build_object('run_id', %s::text, 'state_hash', %s::text,"
        " 'discarded', %s::boolean), clock_timestamp())",
        (i.tenant_id, f"{i.class_id} {i.fortnight_id}", str(who), (reason or "").strip() or None, str(run["id"]),
         _hash(conn, i, fn), changed),
    )  # fmt: skip
    return report
