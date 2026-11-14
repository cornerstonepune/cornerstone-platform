"""CP-49: the level each child reached in one lesson, marked from the lesson page (voice-and-form observation model).

The educator marks children one by one (level 0 to 3, or absent, or not willing) and may set the level of every child
not yet marked ("the rest"). Each mark is one `activity_observation` (route `form`, entry mode `individual`, outcome
`as_expected`: the level is what she saw, not a move from an expected one); a level is evidence on each skill the
lesson's activity names, its mark read from the config row `voice.level_mark`, so the rule that level 0 is a "not yet"
lives in that row and nowhere here. Absent and not willing are observations only. A change to a child's mark is a new
row superseding the current one (rule 4): the old row and its evidence stay, and every reader already leaves out a
superseded observation. Written by code, no model.

What the machine linked is never evidence by itself (the marking safety rule, 14 Nov): only the activity's skills the
school or a person linked count (`voice_confirm.CHOSEN_SKILLS`), and a lesson whose activity comes only from a planner
line a model matched (`plan_entry.link_rule = 'model'`) keeps its marks as observations and writes no evidence, saying
so, until a person sets the lesson's activity.
"""

import datetime as dt
import uuid
from dataclasses import dataclass

from engine.core import db, settings
from engine.w2_print import educator_gate
from engine.w3_read import voice_confirm, voice_intake
from engine.w3_read.voice_store import Refused

STATUSES = ("absent", "not_willing")
CHANGED = (
    "level changed"  # the reason a changed mark gives (an observation naming one it replaces must have one)
)
MARKED = (
    "marked, not taken by default"  # the reason her own mark gives when it replaces a child taken by default
)
DEFAULT = "lesson.rest_default_level"  # config row: the level a child she does not mark is taken at
TAKEN = "group_as_expected"  # entry mode of a child taken at the default level, not marked one by one


@dataclass
class Mark:
    child_id: str
    level: int | None = None
    status: str | None = None
    taken: bool = False  # taken at the default level, not marked by her


@dataclass
class Lesson:
    id: str
    class_id: str
    day: dt.date
    activity: str | None
    by_machine: bool = (
        False  # the activity is only a model's match of the planner line, not the school's or a person's
    )


def _may(conn: db.Conn, staff, class_id: str) -> None:
    """A recording role on the class, or a coordinator who reads that class (the timetable's rule, `educator_gate`)."""
    try:
        voice_intake.may_record(conn, staff, class_id)
    except Refused:
        if not (educator_gate.sees_all(conn, staff) and educator_gate.a_class(conn, staff, class_id)):
            raise Refused("You do not hold this class.", 403) from None


def lesson(conn: db.Conn, email: str, class_id: str, session_id: str) -> tuple[uuid.UUID, Lesson]:
    """Her staff id and the lesson, once she may mark this class and the lesson is this class's (404 otherwise)."""
    staff = voice_intake.staff_of(conn, email)
    class_id = voice_intake.valid_id(class_id)
    _may(conn, staff, class_id)
    held = conn.execute(
        "select s.id, d.on_date, coalesce(s.activity_code, a.code) as activity,"
        " (s.activity_code is null and pe.link_rule = 'model') as by_machine"
        " from session s join school_day d on d.id = s.school_day_id"
        " left join plan_entry pe on pe.id = s.plan_entry_id"
        " left join activity a on a.id = pe.activity_id"
        " where s.id = %s and s.school_class_id = %s",
        (voice_intake.valid_id(session_id), class_id),
    ).fetchone()
    if held is None:
        raise Refused("That lesson is not one of this class's.", 404)
    return staff, Lesson(
        str(held["id"]), class_id, held["on_date"], held["activity"], bool(held["by_machine"])
    )


def _current(conn: db.Conn, lesson_id: str, lock: bool = False) -> dict[str, dict]:
    """child id → the child's current observation of the lesson (one no other observation supersedes). `lock`: two
    saves of one lesson take turns until the transaction ends, so neither supersedes a row the other just superseded.
    An advisory lock on the lesson, not `for update`: rows are append-only and the engine's role may not update them,
    so it may not lock them either."""
    if lock:
        conn.execute("select pg_advisory_xact_lock(hashtextextended(%s, 0))", ("lesson_level:" + lesson_id,))
    rows = conn.execute(
        "select o.* from activity_observation o where o.session_id = %s and not exists"
        " (select 1 from activity_observation n where n.supersedes = o.id)",
        (lesson_id,),
    ).fetchall()
    return {str(r["child_id"]): r for r in rows}


def _checked(marks: list[Mark]) -> dict[str, Mark]:
    out: dict[str, Mark] = {}
    for m in marks:
        if (m.level is None) == (m.status is None):
            raise Refused("Give a level or a status for each child, not both and not neither.")
        if m.level is not None and (isinstance(m.level, bool) or m.level not in (0, 1, 2, 3)):
            raise Refused("A level is 0, 1, 2 or 3.")
        if m.status is not None and m.status not in STATUSES:
            raise Refused("A status is absent or not willing.")
        try:
            child = voice_intake.valid_id(m.child_id)
        except Refused:
            raise Refused("A child marked is not in this class that day.") from None
        if child in out:
            raise Refused("A child is marked twice in one call.")
        out[child] = Mark(child, m.level, m.status)
    return out


def mark(
    conn: db.Conn, email: str, class_id: str, session_id: str, marks: list[Mark],
    day: dt.date | None = None, rest_level: int | None = None,
) -> dict:  # fmt: skip
    """Write the marks (and the rest's level) of one lesson as one confirmation, all or none."""
    staff, lsn = lesson(conn, email, class_id, session_id)
    if not lsn.activity:
        raise Refused("This lesson has no activity yet; choose one.", 409)
    if rest_level is not None and (isinstance(rest_level, bool) or rest_level not in (0, 1, 2, 3)):
        raise Refused("A level is 0, 1, 2 or 3.")
    named = _checked(marks)
    on = day or lsn.day
    enrolled = set(voice_intake.enrolled(conn, lsn.class_id, on).values())
    if any(child not in enrolled for child in named):
        raise Refused("A child marked is not in this class that day.")
    with conn.transaction():
        current = _current(conn, lsn.id, lock=True)
        todo = dict(named)
        if rest_level is not None:  # "the rest": every child she has not marked herself, a default included
            mine = {c for c, o in current.items() if o["entry_mode"] != TAKEN}
            todo |= {c: Mark(c, level=rest_level) for c in enrolled if c not in mine and c not in named}
        elif (named or current) and (default := _default_level(conn)) is not None:
            # once the lesson is touched, a child present and unmarked is taken at the school's default level;
            # a lesson nobody touched writes nothing, so silence there never becomes evidence
            todo |= {
                c: Mark(c, level=default, taken=True) for c in enrolled if c not in current and c not in named
            }
        todo = {c: m for c, m in todo.items() if not _same(current.get(c), m)}
        at = voice_confirm._observed_at(conn, on, db.one(conn, "select now() as n")["n"])
        confirmation = uuid.uuid4()
        evidence = sum(
            _write_one(conn, lsn, staff, confirmation, current.get(c), m, at) for c, m in todo.items()
        )
        skills = db.one(conn, "select count(*) as n " + voice_confirm.CHOSEN_SKILLS, (lsn.activity,))["n"]
    return {
        "confirmation_id": str(confirmation), "written": len(todo), "evidence_written": evidence,
        "activity_has_no_skills": skills == 0, "by_default": sum(m.taken for m in todo.values()),
        "activity_matched_by_machine": lsn.by_machine,
    }  # fmt: skip


def _default_level(conn: db.Conn) -> int | None:
    """The level a present, unmarked child of a touched lesson is taken at (config row `lesson.rest_default_level`);
    None when the school has no such row, and then nobody is taken at any level."""
    level = settings.config(conn, DEFAULT)
    return level if isinstance(level, int) and not isinstance(level, bool) and level in (0, 1, 2, 3) else None


def _same(old: dict | None, m: Mark) -> bool:
    """A mark the child already has is not written again; her own mark over a default is (it is hers now)."""
    if old is None:
        return False
    if old["entry_mode"] == TAKEN and not m.taken:
        return False
    if m.level is not None:
        return old["outcome"] == "as_expected" and old["reached_level"] == m.level
    return old["outcome"] == m.status


def _reason(old: dict | None) -> str | None:
    if old is None:
        return None
    return MARKED if old["entry_mode"] == TAKEN else CHANGED


def _write_one(conn, lsn: Lesson, staff, confirmation, old: dict | None, m: Mark, at) -> int:
    """One observation, superseding the child's current one on this lesson; evidence on each skill when it is a level
    the mark row names. The activity of the row it replaces is kept (a correction is of the same activity)."""
    activity = old["activity_code"] if old else lsn.activity
    outcome = "as_expected" if m.level is not None else m.status
    obs = db.one(
        conn,
        "insert into activity_observation (tenant_id, confirmation_id, activity_code, child_id, class_id, outcome,"
        " entry_mode, route, expected_level, reached_level, observed_at, observed_by, confirmed_by, session_id,"
        " supersedes, reason) select tenant_id, %s, %s, %s, id, %s, %s, 'form', %s, %s, %s, %s, %s, %s, %s, %s"
        " from school_class where id = %s returning id, tenant_id",
        (confirmation, activity, m.child_id, outcome, TAKEN if m.taken else "individual", m.level or 0, m.level, at,
         staff, staff, lsn.id, old["id"] if old else None, _reason(old), lsn.class_id),
    )  # fmt: skip
    if m.level is None or (lsn.by_machine and activity == lsn.activity):
        return 0
    marked = settings.config(conn, "voice.level_mark", {}).get(str(m.level))
    if marked is None:
        return 0
    return conn.execute(
        "insert into evidence_event (tenant_id, child_id, skill_code, channel, observed_at, confirmed_by, kind, mark,"
        " seen_by, place, source, observation_id) select %s, %s, skill_code, 'educator', %s, %s, 'observed', %s, %s,"
        " %s, %s, %s " + voice_confirm.CHOSEN_SKILLS,
        (obs["tenant_id"], m.child_id, at, str(staff), marked, str(staff), f"class {lsn.class_id}",
         f"activity_observation {obs['id']}", obs["id"], activity),
    ).rowcount  # fmt: skip


def read(conn: db.Conn, email: str, class_id: str, session_id: str) -> dict:
    """The lesson's current marks, with no name: a child id, a level or a status, the confirmation and whose it is."""
    staff, lsn = lesson(conn, email, class_id, session_id)
    marks = [
        {
            "child_id": c,
            "level": o["reached_level"],
            "status": o["outcome"] if o["outcome"] in STATUSES else None,
            "confirmation_id": str(o["confirmation_id"]),
            "by": "you" if o["observed_by"] == staff else "another",
            "by_default": o["entry_mode"] == TAKEN,
            "marked_at": o["stored_at"].isoformat(),
        }
        for c, o in sorted(_current(conn, lsn.id).items(), key=lambda kv: kv[1]["stored_at"])
    ]
    roll = [
        {"child_id": child, "sr_no": no}
        for no, child in sorted(
            voice_intake.enrolled(conn, lsn.class_id, lsn.day).items(), key=lambda r: (len(r[0]), r[0])
        )
    ]  # the same enrolment the write checks; `sr_no` is the child's roll number in the class
    return {"activity_code": lsn.activity, "marks": marks, "roll": roll, "last": _last(conn, lsn)}


def _last(conn: db.Conn, lsn: Lesson) -> dict | None:
    """The most recent earlier lesson of this class on the same activity that has marks, counted from current
    observations (a superseded row is not counted). A lesson nobody marked is passed over: it is no last time to
    compare with. None when there is none."""
    if not lsn.activity:
        return None
    held = conn.execute(
        "select s.id, d.on_date from session s join school_day d on d.id = s.school_day_id"
        " left join plan_entry pe on pe.id = s.plan_entry_id left join activity a on a.id = pe.activity_id"
        " where s.school_class_id = %s and d.on_date < %s and coalesce(s.activity_code, a.code) = %s"
        " and exists (select 1 from activity_observation o where o.session_id = s.id)"
        " order by d.on_date desc, s.created_at desc limit 1",
        (lsn.class_id, lsn.day, lsn.activity),
    ).fetchone()
    if held is None:
        return None
    counts = {str(n): 0 for n in range(4)} | dict.fromkeys(STATUSES, 0)
    for o in _current(conn, str(held["id"])).values():
        counts[str(o["reached_level"]) if o["reached_level"] is not None else o["outcome"]] += 1
    return {"session_id": str(held["id"]), "day": held["on_date"].isoformat(), "counts": counts}
