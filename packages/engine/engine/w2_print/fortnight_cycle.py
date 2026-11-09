"""The fortnight cycle (CP-6): every teaching fortnight has one state, planning, frozen, aligned, approved or
list_sent, moved one step at a time, with who and when kept for each step. Once a fortnight is past planning, a change to
its plan lines or timetable needs a reason, which is kept. The engine enforces this, not database triggers
(specs/CP-6/design.md): the engine's writers call `ensure_editable`; hand-run SQL is not stopped.

"Who" is a staff id (or the signed-in login's name in the database), never a person's name. No model, no names."""

import datetime as dt
from typing import Any

from psycopg import sql

from engine.core import db

STATES = ("planning", "frozen", "aligned", "approved", "list_sent")
STEPS = ("freeze", "align", "approve", "list_sent")  # the `fortnight.<step>` settings
LOOKBACK = 31  # days back to look for a working day before giving up


class CycleError(Exception):
    """A step out of order, a frozen fortnight changed with no reason, or a step date that cannot be worked out."""


def _actor(actor: Any) -> str:
    who = str(actor or "").strip()
    if not who:
        raise CycleError("Say who is doing this: a staff id.")
    return who


def move(conn: db.Conn, fortnight_id: Any, to_state: str, actor: Any) -> None:
    """Move a teaching fortnight to its next state. Skipping a step, going back, repeating one or an unknown state
    raises `CycleError` and changes nothing. Stamps the step's time and who, and writes one state row to the history."""
    who = _actor(actor)
    if to_state not in STATES:
        raise CycleError(f"'{to_state}' is not a state: {', '.join(STATES)}.")
    with conn.transaction():
        row = conn.execute(
            "select c.tenant_id, c.state from fortnight_cycle c join fortnight f on f.id = c.fortnight_id"
            " where c.fortnight_id = %s and f.kind = 'teaching' for update of c",
            (fortnight_id,),
        ).fetchone()
        if row is None:
            raise CycleError("That is not a teaching fortnight with a cycle.")
        now = STATES.index(row["state"])
        if now + 1 >= len(STATES) or STATES[now + 1] != to_state:
            nxt = STATES[now + 1] if now + 1 < len(STATES) else "nothing: it is done"
            raise CycleError(f"A fortnight at '{row['state']}' goes next to {nxt}, not to '{to_state}'.")
        conn.execute(
            sql.SQL(
                "update fortnight_cycle set state = %s, {at} = clock_timestamp(), {by} = %s where fortnight_id = %s"
            ).format(at=sql.Identifier(f"{to_state}_at"), by=sql.Identifier(f"{to_state}_by")),
            (to_state, who, fortnight_id),
        )
        conn.execute(
            "insert into fortnight_edit (tenant_id, fortnight_id, kind, subject, op, changed_by)"
            " values (%s, %s, 'state', %s, 'state', %s)",
            (row["tenant_id"], fortnight_id, f"{row['state']}->{to_state}", who),
        )


def is_frozen(conn: db.Conn, tenant_id: Any, on_date: dt.date) -> bool:
    """True when the teaching fortnight holding the date has a cycle row past planning."""
    return db.one(
        conn,
        "select exists (select 1 from fortnight f join fortnight_cycle c on c.fortnight_id = f.id"
        " where f.tenant_id = %s and f.kind = 'teaching' and %s between f.starts_on and f.ends_on"
        " and c.state <> 'planning') as frozen",
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
    returns, writes nothing. Any past planning: no reason (or only spaces) raises `CycleError`; with one, a
    `frozen_change` row per such fortnight keeps the table, the record, the change, the reason and who."""
    frozen = conn.execute(
        "select c.fortnight_id, c.tenant_id, f.number from fortnight_cycle c join fortnight f on f.id = c.fortnight_id"
        " where c.fortnight_id = any(%s::uuid[]) and c.state <> 'planning' order by f.number",
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
            "insert into fortnight_edit (tenant_id, fortnight_id, kind, subject, record_id, op, reason, changed_by)"
            " values (%s, %s, 'frozen_change', %s, %s, %s, %s, %s)",
            (r["tenant_id"], r["fortnight_id"], table, record_id, op, why, who),
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
    setting = conn.execute(
        "select value from config where tenant_id = %s and key = %s",
        (fortnight["tenant_id"], f"fortnight.{step}"),
    ).fetchone()
    if setting is None:
        raise CycleError(f"This school has no fortnight.{step} setting.")
    value = setting["value"]
    days = (
        value.get("days_before_start")
        if isinstance(value, dict) and set(value) == {"days_before_start"}
        else None
    )
    if not isinstance(days, int) or isinstance(days, bool) or days < 0:
        raise CycleError(f'fortnight.{step} must be {{"days_before_start": a whole number, 0 or more}}.')
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
