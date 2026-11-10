"""The fortnight cycle (CP-6): every teaching fortnight has one state (`fortnight.state`), planning, frozen, aligned,
approved or list_sent, moved one step at a time. Each step taken is a row of the one approval list (kind `fortnight`, the
step as its decision, who and when); the state's change is a `change_log` row, written by the one trigger. Once a
fortnight is past planning, a change to its plan lines or timetable needs a reason, kept as a `change_log` row. The
engine enforces this (specs/CP-6/design.md): the engine's writers call `ensure_editable`; hand-run SQL is not stopped.

"Who" is a staff id (or the signed-in login's name in the database), never a person's name. No model, no names."""

import datetime as dt
import re
from typing import Any

from engine.core import db, history, settings

STATES = ("planning", "frozen", "aligned", "approved", "list_sent")
STEPS = (
    "freeze",
    "align",
    "approve",
    "list_sent",
)  # the `fortnight.<step>` settings, and each step's approval row
STEP_TO: dict[str, str] = dict(zip(STATES[1:], STEPS, strict=True))  # the step that reaches a state
LOOKBACK = 31  # days back to look for a working day before giving up
_STAFF_ID = re.compile(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")


class CycleError(Exception):
    """A step out of order, a frozen fortnight changed with no reason, or a step date that cannot be worked out."""


def _actor(actor: Any) -> str:
    who = str(actor or "").strip()
    if not who:
        raise CycleError("Say who is doing this: a staff id.")
    return who


def move(conn: db.Conn, fortnight_id: Any, to_state: str, actor: Any) -> None:
    """Move a teaching fortnight to its next state. Skipping a step, going back, repeating one or an unknown state
    raises `CycleError` and changes nothing. The step is an approval row (who and when); the change of state a history
    row, which the database writes."""
    who = _actor(actor)
    if to_state not in STATES:
        raise CycleError(f"'{to_state}' is not a state: {', '.join(STATES)}.")
    with conn.transaction():
        row = conn.execute(
            "select tenant_id, state from fortnight where id = %s and kind = 'teaching' for update",
            (fortnight_id,),
        ).fetchone()
        if row is None:
            raise CycleError("That is not a teaching fortnight with a cycle.")
        now = STATES.index(row["state"])
        if now + 1 >= len(STATES) or STATES[now + 1] != to_state:
            nxt = STATES[now + 1] if now + 1 < len(STATES) else "nothing: it is done"
            raise CycleError(f"A fortnight at '{row['state']}' goes next to {nxt}, not to '{to_state}'.")
        # the history row names the staff row when `who` is a staff id
        history.by(conn, f"staff:{who}" if _STAFF_ID.fullmatch(who) else who)
        conn.execute("update fortnight set state = %s where id = %s", (to_state, fortnight_id))
        conn.execute(
            "insert into approval (tenant_id, kind, target, decision, by, detail, created_at)"
            " values (%s, 'fortnight', %s, %s, %s, jsonb_build_object('state', %s::text), clock_timestamp())",
            (row["tenant_id"], str(fortnight_id), STEP_TO[to_state], who, to_state),
        )


def standing(conn: db.Conn, fortnight_id: Any) -> dict | None:
    """A teaching fortnight's state, when it was made (at planning) and by whom, and who took each step and when (the
    latest of each), as one row; None when it is not a teaching fortnight."""
    f = conn.execute(
        "select f.id as fortnight_id, f.tenant_id, f.state, coalesce(l.at, f.created_at) as planning_at,"
        " l.origin as planning_by from fortnight f left join lateral (select at, origin from change_log"
        " where table_name = 'fortnight' and row_id = f.id::text and op = 'insert' order by at limit 1) l on true"
        " where f.id = %s and f.kind = 'teaching'",
        (fortnight_id,),
    ).fetchone()
    if f is None:
        return None
    steps = {
        r["decision"]: r
        for r in conn.execute(
            "select decision, by, created_at from approval where kind = 'fortnight' and target = %s order by seq",
            (str(fortnight_id),),
        ).fetchall()
    }
    out = dict(f)
    for state, step in STEP_TO.items():
        took = steps.get(step)
        out[f"{state}_at"], out[f"{state}_by"] = (took["created_at"], took["by"]) if took else (None, None)
    return out


def is_frozen(conn: db.Conn, tenant_id: Any, on_date: dt.date) -> bool:
    """True when the teaching fortnight holding the date has a cycle row past planning."""
    return db.one(
        conn,
        "select exists (select 1 from fortnight f where f.tenant_id = %s and f.kind = 'teaching'"
        " and %s between f.starts_on and f.ends_on and f.state <> 'planning') as frozen",
        (tenant_id, on_date),
    )["frozen"]


def ensure_editable(
    conn: db.Conn,
    fortnight_ids: list[Any],
    *,
    reason: str | None,
    table: str,
    record_id: str,
    op: str,
    actor: Any,
) -> None:
    """The one gate a writer of plan lines or timetable slots calls before it writes. Fortnights still at planning:
    returns, writes nothing. Any past planning: no reason (or only spaces) raises `CycleError`; with one, a `change_log`
    row per such fortnight keeps the table, the record, the change, the fortnight, the reason and who."""
    frozen = conn.execute(
        "select f.id as fortnight_id, f.tenant_id, f.number from fortnight f"
        " where f.id = any(%s::uuid[]) and f.kind = 'teaching' and f.state <> 'planning' order by f.number",
        ([str(i) for i in fortnight_ids],),
    ).fetchall()
    if not frozen:
        return
    why = (reason or "").strip()
    if not why:
        numbers = ", ".join(str(r["number"]) for r in frozen)
        raise CycleError(f"Fortnight {numbers} is frozen: give a reason to change it.")
    who = _actor(actor)
    for r in frozen:
        conn.execute(
            "insert into change_log (tenant_id, table_name, row_id, op, after, staff_id, origin, reason)"
            " values (%s, %s, %s, %s, jsonb_build_object('fortnight_id', %s::text, 'frozen', true),"
            " (select id from staff where id::text = %s), %s, %s)",
            (
                r["tenant_id"],
                table,
                str(record_id),
                op,
                str(r["fortnight_id"]),
                who.removeprefix("staff:"),
                who,
                why,
            ),
        )


def fortnights_touched(
    conn: db.Conn, academic_year_id: Any, *, from_day: dt.date | str | None = None, numbers: Any = ()
) -> list[Any]:
    """The year's teaching fortnights a write reaches: those ending on or after `from_day` (a timetable slot with no
    end covers every later fortnight) and those with one of the given numbers (a plan line names its fortnight)."""
    return [
        r["id"]
        for r in conn.execute(
            "select id from fortnight where academic_year_id = %s and kind = 'teaching'"
            " and (number = any(%s) or ends_on >= %s::date)",
            (academic_year_id, list(numbers), from_day),
        ).fetchall()
    ]


def step_days(conn: db.Conn, tenant_id: Any) -> dict[str, int]:
    """The school's four `fortnight.<step>` settings as days before the fortnight starts, each well-formed, by step.
    `CycleError` for a missing or malformed one."""
    rows = settings.many(conn, [f"fortnight.{s}" for s in STEPS], tenant_id)
    found = {k.removeprefix("fortnight."): v for k, v in rows.items()}
    days: dict[str, int] = {}
    for step in STEPS:
        if step not in found:
            raise CycleError(f"This school has no fortnight.{step} setting.")
        value = found[step]
        n = (
            value.get("days_before_start")
            if isinstance(value, dict) and set(value) == {"days_before_start"}
            else None
        )
        if not isinstance(n, int) or isinstance(n, bool) or n < 0:
            raise CycleError(f'fortnight.{step} must be {{"days_before_start": a whole number, 0 or more}}.')
        days[step] = n
    return days


def out_of_order(days: dict[str, int]) -> bool:
    """True when the steps do not fall freeze, then align, then approve, then list_sent: each one fewer days before
    the fortnight starts than the one before it (audit F9). Reported by the live watch; `step_date` still answers."""
    return not all(days[a] > days[b] for a, b in zip(STEPS, STEPS[1:], strict=False))


def frame_lessons(conn: db.Conn, class_id: Any, fortnight_id: Any) -> int:
    """A class's fortnight with no lessons yet gets them from its frame: every period of each school day (no holiday),
    as the frame's rule of that week (A for the first seven days, B after) and weekday says, an empty cell none. Writes
    nothing when the fortnight has lessons already. The number of lessons written."""
    if conn.execute(
        "select 1 from session s join school_day d on d.id = s.school_day_id join fortnight f on f.id = %s"
        " where s.school_class_id = %s and d.on_date between f.starts_on and f.ends_on limit 1",
        (fortnight_id, class_id),
    ).fetchone():
        return 0
    return conn.execute(
        "insert into session (tenant_id, school_class_id, school_day_id, period_id, subject_code, kind, text)"
        " select c.tenant_id, c.id, d.id, r.period_id, r.subject_code, r.cell, r.text"
        " from fortnight f join school_class c on c.id = %s and c.tenant_id = f.tenant_id"
        " join school_day d on d.campus_id = c.campus_id and d.on_date between f.starts_on and f.ends_on"
        "  and d.kind <> 'holiday' and extract(isodow from d.on_date) <= 5"
        " join timetable_rule r on r.kind = 'frame' and r.school_class_id = c.id and r.cell <> 'empty'"
        "  and r.weekday = extract(isodow from d.on_date)"
        "  and r.week_code = case when d.on_date - f.starts_on < 7 then 'A' else 'B' end"
        "  and r.valid_from <= d.on_date and (r.valid_to is null or r.valid_to >= d.on_date)"
        " where f.id = %s",
        (class_id, fortnight_id),
    ).rowcount


def draft(conn: db.Conn, class_id: Any, fortnight_id: Any, by: Any) -> str:
    """Draft one class's fortnight (CP-7), once its plan is frozen: lessons from its frame when it has none yet (who and
    when kept in the history), then where it stands, as the database decides (`timetable_standing`): rolled forward,
    waiting for a yes, approved, or empty (no school day for its frame)."""
    who = _actor(by)
    f = conn.execute(
        "select tenant_id, number, state from fortnight where id = %s", (fortnight_id,)
    ).fetchone()
    if f is None or f["state"] not in ("frozen", "aligned"):
        said = f"fortnight {f['number']} is {f['state']}" if f else "no such fortnight"
        raise CycleError(f"fortnight cannot be drafted: {said}")
    made = frame_lessons(conn, class_id, fortnight_id)
    if made:
        conn.execute(
            "insert into change_log (tenant_id, table_name, row_id, op, after, staff_id, origin)"
            " values (%s, 'session', %s, 'insert', jsonb_build_object('lessons', %s::int),"
            " (select id from staff where id::text = %s), %s)",
            (f["tenant_id"], f"{class_id} {fortnight_id}", made, who.removeprefix("staff:"), who),
        )
    return db.one(conn, "select state from public.timetable_standing(%s, %s)", (class_id, fortnight_id))[
        "state"
    ]


def draft_classes(conn: db.Conn, year: str, number: int, by: str) -> list[dict]:
    """Draft the fortnight of every class that has a frame or lessons in it (`draft`). Returns grade, section and where
    each class's fortnight stands."""
    fortnight = conn.execute(
        "select f.id, f.starts_on, f.ends_on, f.academic_year_id from fortnight f"
        " join academic_year y on y.id = f.academic_year_id join tenant t on t.id = f.tenant_id"
        " where t.slug = %s and y.label = %s and f.number = %s and f.kind = 'teaching'",
        (db.tenant_slug(), year, number),
    ).fetchone()
    if fortnight is None:
        raise CycleError(f"There is no teaching fortnight {number} in {year}.")
    classes = conn.execute(
        "select c.id, c.grade_code, c.section from school_class c where c.academic_year_id = %s and ("
        " exists (select 1 from timetable_rule r where r.school_class_id = c.id and r.kind = 'frame'"
        "  and r.valid_from <= %s and (r.valid_to is null or r.valid_to >= %s))"
        " or exists (select 1 from session s join school_day d on d.id = s.school_day_id where s.school_class_id = c.id"
        "  and d.on_date between %s and %s)) order by c.grade_code, c.section",
        (fortnight["academic_year_id"], fortnight["ends_on"], fortnight["starts_on"], fortnight["starts_on"],
         fortnight["ends_on"]),
    ).fetchall()  # fmt: skip
    return [
        {
            "grade": c["grade_code"],
            "section": c["section"],
            "state": draft(conn, c["id"], fortnight["id"], by),
        }
        for c in classes
    ]


def step_date(conn: db.Conn, fortnight_id: Any, step: str) -> dt.date:
    """When a step falls: the school's `fortnight.<step>` days before the fortnight starts, moved to the working day
    before while it is a Saturday, a Sunday or a holiday on any campus of the school."""
    if step not in STEPS:
        raise CycleError(f"'{step}' has no date: {', '.join(STEPS)}.")
    fortnight = conn.execute(
        "select tenant_id, starts_on from fortnight where id = %s", (fortnight_id,)
    ).fetchone()
    if fortnight is None:
        raise CycleError("That fortnight is not there.")
    days = step_days(conn, fortnight["tenant_id"])[step]
    day = fortnight["starts_on"] - dt.timedelta(days=days)
    holidays = {
        r["on_date"]
        for r in conn.execute(
            "select on_date from school_day where tenant_id = %s and kind = 'holiday' and on_date between %s and %s",
            (fortnight["tenant_id"], day - dt.timedelta(days=LOOKBACK), day),
        ).fetchall()
    }
    for back in range(LOOKBACK + 1):
        candidate = day - dt.timedelta(days=back)
        if candidate.weekday() < 5 and candidate not in holidays:
            return candidate
    raise CycleError(f"No working day within {LOOKBACK} days before {day}.")
