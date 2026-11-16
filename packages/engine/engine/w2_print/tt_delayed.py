"""CP-59: lessons that were delayed, moved to a coming week in one save (Nimish, 16 Nov 2026: "teachers must be able to move a set of
lessons to a coming week, understanding what moved, what changed and what wasn't taught").

`tt_move` moves a lesson inside one fortnight, from a day not yet gone by, and swaps with what it finds there. A delayed lesson is the
other case: its day has gone by, it was never taught (still `planned`), and it goes to a free place in a later week, perhaps of the next
fortnight. So this moves each named lesson to a free place and nothing else: it never swaps (a lesson swapped back into a past day
would only move the delay), and it moves nothing taught, marked or fixed. Every check runs before any write; one refusal takes back
the whole save and names its lesson. Each lesson is moved by `tt_move`'s own writer (its materials links follow it) and kept as its own
`change_log` row (`session`, op `move`), the same row the moves ledger reads. Code decides everything; no model, no name."""

import datetime as dt
from typing import Any

from engine.core import db
from engine.w2_print import educator_gate as gate
from engine.w2_print import fortnight_cycle as fc
from engine.w2_print import tt_clash, tt_move
from engine.w2_print.tt_clash import Refused
from engine.w2_print.tt_move import Place


def _source(conn: db.Conn, k: dict, session_id: str, today: dt.date) -> Place:
    """The lesson to move: this class's own, planned, not fixed, and on a day already gone by."""
    s = conn.execute(
        "select s.*, d.on_date, p.id as pid, p.label, p.fixed from session s join school_day d on d.id = s.school_day_id"
        " join period p on p.id = s.period_id where s.id::text = %s and s.school_class_id = %s",
        (session_id, k["id"]),
    ).fetchone()
    if s is None:
        raise Refused(f"lesson {session_id} is not a lesson of this class.")
    name = f"{s['text'] or s['label']} on {s['on_date']}"
    if s["kind"] == "fixed":
        raise Refused(f"{name} is a fixed lesson; it is not moved.")
    if s["state"] != "planned" or not s["planned"]:
        raise Refused(
            f"{name} is already marked {s['state'].replace('_', ' ')}; only a lesson not taught is moved."
        )
    if s["on_date"] >= today:
        raise Refused(f"{name} has not gone by yet; move it from the fortnight instead.")
    p = Place(
        s["on_date"], {"id": s["pid"], "label": s["label"], "fixed": s["fixed"]}, s["school_day_id"], dict(s)
    )
    return p


def move_delayed(
    conn: db.Conn, grade: str, section: str, year: str, moves: list[tuple[str, dt.date, int]],
    *, who: Any, reason: str | None = None,
) -> dict:  # fmt: skip
    """Move each lesson (`session_id`, to this date, to this period's ordinal) to a free place, in one save as `who`."""
    if not moves:
        raise Refused("Tick at least one lesson to move.")
    if len({m[0] for m in moves}) != len(moves):
        raise Refused("A lesson is named twice.")
    if len({(m[1], m[2]) for m in moves}) != len(moves):
        raise Refused("Two lessons are sent to the same place.")
    k = tt_move._class(conn, grade, section, year)  # noqa: SLF001
    conn.execute(
        "select pg_advisory_xact_lock(hashtext(%s), hashtext(%s))", (str(k["tenant_id"]), str(k["id"]))
    )
    today = gate.school_today(conn)
    done: list[dict] = []
    with conn.transaction():  # one refusal takes back every lesson already moved in this save
        for session_id, to, to_ord in moves:
            a = _source(conn, k, session_id, today)
            b = tt_move._place(conn, k, grade, to, to_ord, today)  # noqa: SLF001
            f_from, f_to = tt_move._fortnight(conn, k, a.date), tt_move._fortnight(conn, k, to)  # noqa: SLF001
            fc.ensure_editable(
                conn, sorted({f_from["id"], f_to["id"]}, key=str), reason=reason, table="session",
                record_id=str(k["id"]), op="update", actor=who,
            )  # fmt: skip
            fc.frame_lessons(conn, k["id"], f_to["id"])
            tt_move._fill(conn, k, b)  # noqa: SLF001
            if b.session is not None:
                raise Refused(
                    f"{to} ({b.period['label']}) already holds a lesson; a delayed lesson goes to a free place."
                )
            tt_move._materials_stay_valid(conn, a, b)  # noqa: SLF001
            tt_move._swap(conn, a, b)  # noqa: SLF001
            tt_move._kept(conn, k, f_to, a, b, who, reason)  # noqa: SLF001
            state = conn.execute("select state from fortnight where id = %s", (f_to["id"],)).fetchone()
            if state and state["state"] in tt_move.SETTLED and tt_clash.blocks_approval(conn, k["tenant_id"]):
                open_ = tt_clash.open_by_kind(conn, f_to["id"])
                if open_:
                    raise Refused(
                        f"fortnight {f_to['number']} is {state['state']} and this would leave {tt_clash.words(open_)}."
                    )
            done.append(
                {
                    "session_id": session_id,
                    "from": f"{a.date} {a.period['label']}",
                    "to": f"{to} {b.period['label']}",
                }
            )
    return {"moved": done, "count": len(done)}
