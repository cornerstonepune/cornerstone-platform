"""CP-39: one list of heads for the timetable and the activities (specs/CP-39/spec.md).

A lesson has a head (`session.subject_code`: math, story, clay…; a fixed lesson such as Circle Time has none and is found
by its words). An activity has a group (`activity.strand`: Maths, Story Telling, Clay…). The setting `timetable.heads`
says which groups each head takes, so a lesson is offered only the activities of its head, and an activity's head is worked
out from its group when asked, never stored. Code decides; no model, no name."""

from typing import Any

from engine.core import db, settings, subject_map
from engine.w2_print import educator_gate as gate
from engine.w2_print import tt_live
from engine.w2_print.tt_live_plan import Refused

KEY = "timetable.heads"


def heads(conn: db.Conn) -> list[dict]:
    """The school's list of heads, as its setting holds it (none: an empty list)."""
    return [dict(h) for h in settings.config(conn, KEY, []) or []]


def head_of(listed: list[dict], subject_code: str | None, kind: str | None, text: str | None) -> str | None:
    """The head of a lesson: its subject code when the list names it, else, for a fixed lesson, the head whose `fixed_text`
    its words begin with; none when neither."""
    if subject_code:
        return subject_code if any(h["code"] == subject_code for h in listed) else None
    if kind == "fixed" and text:
        for h in listed:
            if h.get("fixed_text") and text.startswith(h["fixed_text"]):
                return h["code"]
    return None


def groups_of(listed: list[dict], head: str | None) -> list[str]:
    """The activity groups a head takes (none for an unknown head or one that takes no activity)."""
    return next((list(h["groups"]) for h in listed if h["code"] == head), [])


def heads_in(listed: list[dict], spellings: dict[str, str], subjects: list[str]) -> set[str]:
    """The heads that teach one of `subjects` (subject codes): a head whose activity groups the school spells as one of
    them (`curriculum.subjects`). Maths and Block Room are NUM, so `math` is a NUM head; a head with no group has none."""
    return {h["code"] for h in listed if any(spellings.get(g) in subjects for g in h["groups"])}


def label_of(listed: list[dict], head: str | None) -> str:
    return next((h["label"] for h in listed if h["code"] == head), head or "")


def subjects_of(conn: db.Conn, lesson: dict) -> list[str]:
    """The subject codes a lesson's head teaches (the school's spellings of its activity groups): `math` is NUM, a Grade 1 to 4
    head is its own subject code. None for a lesson whose head takes no activity."""
    listed = heads(conn)
    head = head_of(listed, lesson["subject_code"], lesson["kind"], lesson["text"])
    spell = subject_map.spellings(conn, lesson["tenant_id"])
    return sorted({spell[g] for g in groups_of(listed, head) if g in spell})


def offered_only(conn: db.Conn, lesson: dict) -> list[str]:
    """The groups a lesson is offered without its head teaching them (ADR 0117): the setting `timetable.offers`, by the
    lesson's grade and then its subject code; none when either is not there. Never read by `subjects_of` or `heads_in`."""
    raise NotImplementedError


def _linked(conn: db.Conn, lesson: dict, activity_code: str, lo_code: str | None) -> bool:
    """Whether the activity is one of the grade's linked to the lesson's objective (CP-74: offered whatever its group)."""
    if not lo_code:
        return False
    return (
        conn.execute(
            "select 1 from activity_objective o join activity a on a.tenant_id = o.tenant_id and a.code = o.activity_code"
            " where o.tenant_id = %s and o.activity_code = %s and o.lo_code = %s and (a.band = %s or %s = any(a.also_bands))",
            (lesson["tenant_id"], activity_code, lo_code, lesson["grade_code"], lesson["grade_code"]),
        ).fetchone()
        is not None
    )


def ensure_offered(conn: db.Conn, lesson: dict, activity_code: str, lo_code: str | None = None) -> None:
    """Refuse unless `activity_code` is an activity of the lesson's grade in a group the lesson's head takes, or one linked to
    the lesson's objective `lo_code`."""
    if _linked(conn, lesson, activity_code, lo_code):
        return
    listed = heads(conn)
    head = head_of(listed, lesson["subject_code"], lesson["kind"], lesson["text"])
    groups = groups_of(listed, head)
    if not groups:
        raise Refused("A lesson of this kind takes no activity.")
    found = conn.execute(
        "select name, strand from activity where tenant_id = %s and code = %s and band = %s",
        (lesson["tenant_id"], activity_code, lesson["grade_code"]),
    ).fetchone()
    if found is None:
        raise Refused(f"there is no activity '{activity_code}' for this grade.")
    if found["strand"] not in groups:
        raise Refused(
            f"'{found['name']}' is in {found['strand']}, which a {label_of(listed, head)} lesson does not take."
        )


def offers(conn: db.Conn, session_id: str, *, who: Any) -> dict:
    """The activities a lesson may hold, for the coordinator to choose from: those of its head, with how many objectives and
    skills each has. Only the go-live group (as `tt_edit.edit`)."""
    lesson = conn.execute(
        "select s.id, s.tenant_id, s.subject_code, s.kind, s.text, s.activity_code, c.grade_code"
        " from session s join school_class c on c.id = s.school_class_id where s.id = %s",
        (session_id,),
    ).fetchone()
    if lesson is None:
        raise Refused("there is no lesson with that id.")
    tt_live.in_group(
        conn, str(lesson["tenant_id"]), who, gate.school_today(conn), what="choose a lesson's activity"
    )
    listed = heads(conn)
    head = head_of(listed, lesson["subject_code"], lesson["kind"], lesson["text"])
    groups = groups_of(listed, head)
    rows = (
        conn.execute(
            "select a.code, a.name, a.strand,"
            " (select count(*) from activity_objective o where o.tenant_id = a.tenant_id and o.activity_code = a.code)::int as objectives,"
            " (select count(*) from activity_skill k where k.tenant_id = a.tenant_id and k.activity_code = a.code)::int as skills"
            " from activity a where a.tenant_id = %s and a.band = %s and a.strand = any(%s) order by a.strand, a.name",
            (lesson["tenant_id"], lesson["grade_code"], groups),
        ).fetchall()
        if groups
        else []
    )
    return {
        "session_id": str(lesson["id"]), "head": head, "label": label_of(listed, head), "groups": groups,
        "activity_code": lesson["activity_code"], "activities": [dict(r) for r in rows],
    }  # fmt: skip
