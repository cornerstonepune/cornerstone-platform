"""CP-70 (specs/CP-70/spec.md): a coordinator edits the curriculum in place. An objective's title, subject and unit; an activity's
name, steps, materials and four rubric levels; the grades an objective or an activity sits in; the skills and objectives each is tied
to. Live at once, no approval queue. Every change is one `change_log` row (who, when, before, after, why), written by the table's own
trigger, and `undo` takes one back as a new row. A person's edit stands against a reload: an objective reads `source = 'person'`, and the
loaders already leave any row whose history names a member of staff (`seed_activity.by_a_person`).

An objective's home grade is `band`; its other grades are `also_bands` (an activity's the same): data on the row, not a table
(docs/data-model.md). One UPDATE per changed field, so each change is one history row and can be taken back alone. Only the
coordinators write (`educator_gate.sees_all`), checked first, before anything is read or written. No model, no name."""

from typing import Any, LiteralString

from psycopg import sql

from engine.core import db
from engine.core import history as kept
from engine.w1_bank.curriculum_history import LINKS, history
from engine.w2_print import educator_gate as gate

__all__ = ["history"]  # read through this door, kept in its own file

OBJECTIVE_FIELDS = ("title", "unit", "subject_code")
ACTIVITY_FIELDS = ("name", "steps", "materials", "level_0", "level_1", "level_2", "level_3")
NOT_BLANK = ("title", "name", "level_0", "level_1", "level_2", "level_3")  # the school's rule: nothing empty
GRADED: dict[str, tuple[LiteralString, str]] = {
    "objective": ("learning_objective", "an objective"),
    "activity": ("activity", "an activity"),
}
OWNER: dict[str, LiteralString] = {
    "activity_skill": "activity",
    "activity_objective": "activity",
    "learning_objective_skill": "learning_objective",
}
UNDOABLE = {
    "learning_objective": OBJECTIVE_FIELDS + ("subject", "band", "also_bands"),
    "activity": ACTIVITY_FIELDS + ("band", "also_bands"),
}


class Refused(Exception):
    """A change the curriculum will not take, in words a coordinator can read; `status` is what the door answers."""

    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.status = status


def _q(text: LiteralString, **names: str) -> sql.Composed:
    """A statement with its table and column names set in as quoted identifiers (never as text); every name comes from one of the
    maps above, and the values go in as parameters."""
    return sql.SQL(text).format(**{k: sql.Identifier(v) for k, v in names.items()})


def _guard(conn: db.Conn, staff: db.Id) -> None:
    if not gate.sees_all(conn, staff):
        raise Refused("Only a coordinator edits the curriculum.", 403)


def _by(conn: db.Conn, staff: db.Id, reason: str | None) -> None:
    kept.by(
        conn, f"curriculum_edit staff:{staff}", reason or ""
    )  # '' clears an earlier reason in this transaction


def _row(conn: db.Conn, t: db.Id, kind: str, code: str) -> dict[str, Any]:
    table = GRADED[kind][0]
    row = conn.execute(f"select * from {table} where tenant_id = %s and code = %s", (t, code)).fetchone()  # noqa: S608
    if row is None:
        raise Refused(f"There is no {kind} {code}.", 404)
    return row


def grades_of(row: dict[str, Any]) -> list[str]:
    """The home grade first, then the others in the order they were added."""
    return [g for g in [row["band"], *row["also_bands"]] if g]


def objective(conn: db.Conn, t: db.Id, code: str) -> dict[str, Any]:
    """The objective as it now stands, for the panel: its words, its subject, its grades and whether a person made it."""
    r = _row(conn, t, "objective", code)
    return {"code": code, "title": r["title"], "unit": r["unit"], "subject_code": r["subject_code"], "subject": r["subject"],
            "grades": grades_of(r), "source": r["source"]}  # fmt: skip


def _set(
    conn: db.Conn, t: db.Id, table: LiteralString, code: str, column: str, value: Any, person: bool = False
) -> None:
    tail = ", source = 'person'" if person else ""
    conn.execute(
        _q("update {t} set {c} = %s" + tail + " where tenant_id = %s and code = %s", t=table, c=column),
        (value, t, code),
    )


def edit_objective(
    conn: db.Conn, t: db.Id, staff: db.Id, code: str, changes: dict[str, str], reason: str | None = None
) -> dict[str, Any]:
    """Change an objective's title, unit or subject (a subject code). The row then reads as a person's."""
    _guard(conn, staff)
    if unknown := set(changes) - set(OBJECTIVE_FIELDS):
        raise Refused(f"An objective's {', '.join(sorted(unknown))} cannot be edited here.")
    have = _row(conn, t, "objective", code)
    _by(conn, staff, reason)
    for field, new in changes.items():
        new = (new or "").strip()
        if field in NOT_BLANK and not new:
            raise Refused("The title cannot be empty.")
        if new == (have[field] or ""):
            continue
        if field == "subject_code":
            sub = conn.execute(
                "select coalesce(label, name) as word from subject where tenant_id = %s and code = %s",
                (t, new),
            ).fetchone()
            if sub is None:
                raise Refused(f"{new} is not a subject of the school.")
            conn.execute(
                "update learning_objective set subject_code = %s, subject = %s, source = 'person' where tenant_id = %s and code = %s",
                (new, sub["word"], t, code),
            )
        else:
            _set(conn, t, "learning_objective", code, field, new, person=True)
    return objective(conn, t, code)


def edit_activity(
    conn: db.Conn, t: db.Id, staff: db.Id, code: str, changes: dict[str, str], reason: str | None = None
) -> dict[str, Any]:
    """Change an activity's name, steps, materials or one of its four rubric levels."""
    _guard(conn, staff)
    if unknown := set(changes) - set(ACTIVITY_FIELDS):
        raise Refused(f"An activity's {', '.join(sorted(unknown))} cannot be edited here.")
    have = _row(conn, t, "activity", code)
    _by(conn, staff, reason)
    for field, new in changes.items():
        new = (new or "").strip()
        if field in NOT_BLANK and not new:
            word = "Name" if field == "name" else "A rubric level"
            raise Refused(f"{word} cannot be empty.")
        if new != (have[field] or ""):
            _set(conn, t, "activity", code, field, new)
            _lists_follow(conn, t, code, field)
    return {k: _row(conn, t, "activity", code)[k] for k in ("code", *ACTIVITY_FIELDS)} | {
        "grades": grades_of(_row(conn, t, "activity", code))
    }


def _lists_follow(conn: db.Conn, t: db.Id, code: str, field: str) -> None:
    """The steps are also kept as a list (`steps_list`, what the page shows first): once the words are set here the list is
    dropped, so the page reads the words, one step a line, and never an older list."""
    if field == "steps":
        conn.execute("update activity set steps_list = null where tenant_id = %s and code = %s", (t, code))


def _materials_are_a_list(conn: db.Conn, t: db.Id, code: str) -> bool:
    return bool(
        conn.execute(
            "select 1 from activity_material where tenant_id = %s and activity_code = %s limit 1", (t, code)
        ).fetchone()
    )


def _grade_known(conn: db.Conn, t: db.Id, grade: str) -> None:
    if not conn.execute("select 1 from grade where tenant_id = %s and code = %s", (t, grade)).fetchone():
        raise Refused(f"{grade} is not a grade of the school.")


def add_grade(
    conn: db.Conn, t: db.Id, staff: db.Id, kind: str, code: str, grade: str, reason: str | None = None
) -> list[str]:
    """Put an objective or an activity in one more grade (it then shows under that grade, in the same subject and unit). Nothing else on
    the row changes, and adding a grade it is already in changes nothing."""
    _guard(conn, staff)
    have = _row(conn, t, kind, code)
    _grade_known(conn, t, grade)
    if grade not in grades_of(have):
        _by(conn, staff, reason)
        _set(
            conn,
            t,
            GRADED[kind][0],
            code,
            "also_bands",
            [*have["also_bands"], grade],
            person=kind == "objective",
        )
    return grades_of(_row(conn, t, kind, code))


def remove_grade(
    conn: db.Conn, t: db.Id, staff: db.Id, kind: str, code: str, grade: str, reason: str | None = None
) -> list[str]:
    """Take an objective or an activity out of a grade. It is never deleted, and one grade always stays: removing the home grade makes the
    next one the home grade."""
    _guard(conn, staff)
    have = _row(conn, t, kind, code)
    now = grades_of(have)
    if grade not in now:
        raise Refused(f"{code} is not in {grade}.")
    if len(now) == 1:
        raise Refused(
            f"{GRADED[kind][1].capitalize()} stays in at least one grade: add another before taking {grade} out."
        )
    rest = [g for g in now if g != grade]
    _by(conn, staff, reason)
    tail = ", source = 'person'" if kind == "objective" else ""
    conn.execute(
        _q(
            "update {t} set band = %s, also_bands = %s" + tail + " where tenant_id = %s and code = %s",
            t=GRADED[kind][0],
        ),
        (rest[0], rest[1:], t, code),
    )
    return grades_of(_row(conn, t, kind, code))


def link(
    conn: db.Conn, t: db.Id, staff: db.Id, table: str, one: str, other: str, reason: str | None = None
) -> str:
    """Tie an activity to a skill or an objective, or an objective to a skill, as a person's link: "added", "claimed" (the machine had made
    it; it is now a person's) or "already" (nothing to do)."""
    _guard(conn, staff)
    mine, theirs, other_table, word = _link_columns(table)
    owner = OWNER[table]
    if not conn.execute(
        _q("select 1 from {o} where tenant_id = %s and code = %s", o=owner), (t, one)
    ).fetchone():
        raise Refused(f"There is no {owner.replace('_', ' ')} {one}.", 404)
    if not conn.execute(
        _q("select 1 from {o} where tenant_id = %s and code = %s", o=other_table), (t, other)
    ).fetchone():
        raise Refused(f"There is no {word} {other}.", 404)
    have = conn.execute(
        _q(
            "select source from {t} where tenant_id = %s and {m} = %s and {th} = %s",
            t=table,
            m=mine,
            th=theirs,
        ),
        (t, one, other),
    ).fetchone()
    if have and have["source"] == "person":
        return "already"
    _by(conn, staff, reason)
    if have:
        conn.execute(
            _q(
                "update {t} set source = 'person' where tenant_id = %s and {m} = %s and {th} = %s",
                t=table,
                m=mine,
                th=theirs,
            ),
            (t, one, other),
        )
        return "claimed"
    _insert_link(conn, t, table, one, other)
    return "added"


def _link_columns(table: str) -> tuple[LiteralString, LiteralString, LiteralString, str]:
    if table not in LINKS:
        raise Refused(f"{table} is not a link a coordinator edits.")
    return LINKS[table]


def _insert_link(conn: db.Conn, t: db.Id, table: str, one: str, other: str) -> None:
    mine, theirs, _, _ = _link_columns(table)
    if table == "activity_objective":  # an objective joins at the end of the activity's own order
        conn.execute(
            _q("insert into {t} (tenant_id, {m}, {th}, source, ord) values (%s, %s, %s, 'person',"
               " (select coalesce(max(ord), 0) + 1 from activity_objective where tenant_id = %s and activity_code = %s))", t=table, m=mine, th=theirs),
            (t, one, other, t, one),
        )  # fmt: skip
    else:
        conn.execute(
            _q(
                "insert into {t} (tenant_id, {m}, {th}, source) values (%s, %s, %s, 'person')",
                t=table,
                m=mine,
                th=theirs,
            ),
            (t, one, other),
        )


def unlink(
    conn: db.Conn, t: db.Id, staff: db.Id, table: str, one: str, other: str, reason: str | None = None
) -> str:
    """Take a link away. The activity, the objective and the skill stay; only the tie goes, and it is in the history."""
    _guard(conn, staff)
    mine, theirs, _, word = _link_columns(table)
    _by(conn, staff, reason)
    gone = conn.execute(
        _q("delete from {t} where tenant_id = %s and {m} = %s and {th} = %s", t=table, m=mine, th=theirs),
        (t, one, other),
    ).rowcount
    if not gone:
        raise Refused(f"{one} is not tied to that {word}.")
    return "removed"


def _same_thing(table: str, this: dict[str, Any], later: dict[str, Any]) -> bool:
    """Whether a later change is about what this one was about: the same tie (a link's row names only its owner), or a field they share."""
    if table in LINKS:
        return this.get(LINKS[table][1]) == later.get(LINKS[table][1])
    return bool(set(this) & set(later))


def _put_back(conn: db.Conn, t: db.Id, table: LiteralString, code: str, before: dict[str, Any]) -> None:
    """The fields of one change set back to what they were, on an objective or an activity."""
    if not set(before) <= set(UNDOABLE[table]):
        raise Refused("That kind of change cannot be taken back here.")
    if table == "activity" and "materials" in before and _materials_are_a_list(conn, t, code):
        raise Refused("The materials are a list with counts: change them in the materials list instead.")
    cols = sql.SQL(", ").join(sql.SQL("{} = %s").format(sql.Identifier(k)) for k in before)
    tail = sql.SQL(", source = 'person'") if table == "learning_objective" else sql.SQL("")
    stmt = sql.SQL("update {t} set {cols}{tail} where tenant_id = %s and code = %s")
    conn.execute(stmt.format(t=sql.Identifier(table), cols=cols, tail=tail), (*before.values(), t, code))
    if table == "activity":
        for field in before:
            _lists_follow(conn, t, code, field)


def undo(conn: db.Conn, t: db.Id, staff: db.Id, change_id: str) -> dict[str, str]:
    """Take one change back, as a new change: the field goes back to what it was, a link added is removed, a link removed is tied again.
    Refused, in words, for a change a person did not make, and when a later change touched the same field or link: take that one back
    first. The log is never edited."""
    _guard(conn, staff)
    c = conn.execute(
        "select * from change_log where tenant_id = %s and id::text = %s", (t, change_id)
    ).fetchone()
    if c is None:
        raise Refused("That change is not in the history.", 404)
    if c["staff_id"] is None:
        raise Refused("Only a change a person made can be taken back here.")
    table, before, after = c["table_name"], c["before"] or {}, c["after"] or {}
    later = conn.execute(
        "select before, after from change_log where tenant_id = %s and table_name = %s and row_id = %s and at > %s",
        (t, table, c["row_id"], c["at"]),
    ).fetchall()
    for ln in later:
        if _same_thing(table, before | after, (ln["before"] or {}) | (ln["after"] or {})):
            raise Refused(
                f"A later change touched this: take that one back first (history of {c['row_id']})."
            )
    _by(conn, staff, f"undo of {change_id}")
    if table in UNDOABLE:
        _put_back(conn, t, table, c["row_id"], before)
    elif table in LINKS:
        mine, theirs, _, _ = LINKS[table]
        if c["op"] == "insert":
            conn.execute(
                _q(
                    "delete from {t} where tenant_id = %s and {m} = %s and {th} = %s",
                    t=table,
                    m=mine,
                    th=theirs,
                ),
                (t, c["row_id"], after[theirs]),
            )
        else:
            _insert_link(conn, t, table, c["row_id"], before[theirs])
    else:
        raise Refused("That kind of change cannot be taken back here.")
    return {"undone": change_id}
