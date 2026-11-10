"""A class's notes for the educator's Notes and Record screens (issue #565): the list of her notes with each one's state,
the children it names and the problems the reader raised, the count of children with a note waiting, and the note she
types ("Type the marks"), which is a note with no recording.

Nothing here is stored beside what exists. A draft's problems and its children are worked out when asked
(`voice_intake.resolve`: problems block Confirm, so a confirmed claim carries none); a confirmed claim's children are
the note's current `activity_observation` rows, one per child, never a copy on the claim."""

import datetime as dt
import uuid
from collections import defaultdict
from typing import Any

from engine.core import db, settings
from engine.w3_read import k2_reads, voice_intake, voice_store
from engine.w3_read.voice_store import Refused

WAITING = ("received", "drafted")
LISTS = voice_intake.LISTS


def _held(conn: db.Conn, email: str, class_id: str) -> tuple[uuid.UUID, str]:
    """Her staff id and the class id, once she is shown to hold the class (the rule recording holds her to)."""
    staff = voice_intake.staff_of(conn, email)
    voice_intake.may_record(conn, staff, class_id)
    return staff, voice_intake.valid_id(str(class_id))


def create_typed(conn: db.Conn, email: str, class_id: str, session_id: str | None = None) -> str:
    """The empty note for typing the marks: no recording, no words, waiting for her to confirm like any other note."""
    staff, class_id = _held(conn, email, class_id)
    if session_id is not None:
        session_id = voice_intake.valid_id(session_id)
        if (
            conn.execute(
                "select 1 from session where id = %s and school_class_id = %s", (session_id, class_id)
            ).fetchone()
            is None
        ):
            raise Refused("This lesson is not one of this class's.", 422)
    note = db.one(
        conn,
        "insert into pii.educator_note (tenant_id, staff_id, class_id, session_id, audio_key, transcript, status)"
        " select tenant_id, %s, id, %s, null, null, 'drafted' from school_class where id = %s returning id",
        (staff, session_id, class_id),
    )
    return str(note["id"])


def _claims(conn: db.Conn, ids: list[Any]) -> dict[Any, list[dict]]:
    """Each confirmed note's lines beside what she kept, and the children each list covers: the note's observations
    that no later correction replaced."""
    seen: dict[Any, dict[str, list[str]]] = defaultdict(lambda: defaultdict(list))
    for o in conn.execute(
        "select o.note_id, o.outcome, o.child_id from activity_observation o where o.note_id = any(%s)"
        " and not exists (select 1 from activity_observation s where s.supersedes = o.id)",
        (ids,),
    ).fetchall():
        seen[o["note_id"]][o["outcome"]].append(str(o["child_id"]))
    out: dict[Any, list[dict]] = defaultdict(list)
    for c in conn.execute(
        "select note_id, section, decision, read_as, kept_as from pii.note_claim where note_id = any(%s)"
        " order by span_start, id",
        (ids,),
    ).fetchall():
        kids = sorted(seen[c["note_id"]][c["section"]]) if c["section"] in LISTS else []
        out[c["note_id"]].append({
            "section": c["section"], "decision": c["decision"], "read_as": c["read_as"],
            "kept_as": c["kept_as"], "children": kids,
        })  # fmt: skip
    return out


def class_notes(conn: db.Conn, email: str, class_id: str, day: dt.date | None = None) -> dict:
    """Her notes for one class received on a day, and, over all her notes still waiting in the class, how many notes
    wait on each child. Only her own notes, only for a class she holds."""
    staff, class_id = _held(conn, email, class_id)
    notes = conn.execute(
        "select *, floor(extract(epoch from now() - received_at) / 3600)::int as age_hours from pii.educator_note"
        " where staff_id = %s and class_id = %s order by received_at, id",
        (staff, class_id),
    ).fetchall()
    return _listing(conn, notes, day or settings.school_today(conn))


def coordinator_notes(conn: db.Conn, email: str, day: dt.date | None = None) -> dict:
    """Every educator's notes for every class of the coordinator's campus, received on a day, with the same fields as
    her own list and the class each note belongs to. Coordinators only (`k2.reads` roles)."""
    _, campus = k2_reads.require_coordinator(conn, email)
    notes = conn.execute(
        "select n.*, floor(extract(epoch from now() - n.received_at) / 3600)::int as age_hours"
        " from pii.educator_note n join school_class c on c.id = n.class_id where c.campus_id = %s"
        " order by n.received_at, n.id",
        (campus,),
    ).fetchall()
    return _listing(conn, notes, day or settings.school_today(conn))


def _listing(conn: db.Conn, notes: list[dict], day: dt.date) -> dict:
    hours = int(settings.config(conn, "voice.confirm_within_hours", 48))
    labels = {
        r["id"]: f"{r['grade_code']} {r['section']}"
        for r in conn.execute(
            "select id, grade_code, section from school_class where id = any(%s)",
            (list({n["class_id"] for n in notes}),),
        ).fetchall()
    }
    rolls: dict[tuple, dict[str, str]] = {}

    def enrolled_on(cid: str, on: dt.date) -> dict[str, str]:
        if (cid, on) not in rolls:
            rolls[(cid, on)] = voice_intake.enrolled(conn, cid, on)
        return rolls[(cid, on)]

    confirmed = [n["id"] for n in notes if n["status"] == "confirmed"]
    claims = _claims(conn, confirmed) if confirmed else {}
    shown: list[dict] = []
    waiting: dict[str, int] = defaultdict(int)
    for n in notes:
        late = n["status"] == "left_unconfirmed" or (n["status"] in WAITING and n["age_hours"] >= hours)
        typed = n["audio_key"] is None
        found = None
        if n["status"] in WAITING and not late and (n["transcript"] or "").strip():
            found = voice_intake.resolve(conn, n, enrolled_on)
            for child in set(found.children.values()):
                waiting[child] += 1
        received = voice_intake.school_day(conn, n["received_at"])
        if received != day:
            continue
        taught = found.taught_on if found else received
        state = (
            "confirmed" if n["status"] == "confirmed"
            else "left_unconfirmed" if late
            else "being_read" if found is None and not typed
            else "fix_this" if found is not None and found.blocked
            else "to_confirm"
        )  # fmt: skip
        kids = sorted({c for line in claims.get(n["id"], []) for c in line["children"]})
        shown.append({
            "note_id": str(n["id"]), "class_id": str(n["class_id"]), "class": labels[n["class_id"]],
            "status": n["status"], "state": state, "typed": typed, "photos": len(n["photo_keys"]),
            "session_id": None if n["session_id"] is None else str(n["session_id"]),
            "received_at": n["received_at"].isoformat(), "taught_on": taught.isoformat(),
            "activity": found.activity if found else None,
            "children": sorted(set(found.children.values())) if found else kids,
            "problems": [*found.draft.problems, *found.problems] if found else [],
            "claims": claims.get(n["id"], []),
        })  # fmt: skip
    return {"notes": shown, "waiting_by_child": dict(waiting)}


def session_note(conn: db.Conn, email: str, class_id: str, session_id: str) -> str:
    """Her note for a lesson: the one she has, else an empty one made for it (a photo or marks for a lesson hang on it)."""
    staff, class_id = _held(conn, email, class_id)
    lesson = voice_intake.lesson_of(conn, session_id, class_id)
    if lesson is None:
        raise Refused("Name the lesson.", 422)
    have = conn.execute(
        "select id from pii.educator_note where staff_id = %s and class_id = %s and session_id = %s"
        " and audio_deleted_at is null order by received_at desc limit 1",
        (staff, class_id, lesson),
    ).fetchone()
    return str(have["id"]) if have else create_typed(conn, email, class_id, lesson)


def _own_note(conn: db.Conn, email: str, note_id: str) -> dict:
    staff = voice_intake.staff_of(conn, email)
    note = conn.execute(
        "select * from pii.educator_note where id = %s for update", (voice_intake.valid_id(note_id),)
    ).fetchone()
    if note is None or note["staff_id"] != staff:
        raise Refused("This is not one of your notes.", 404)
    voice_intake.may_record(conn, staff, str(note["class_id"]))
    return note


def add_photo(conn: db.Conn, email: str, note_id: str, filename: str, data: bytes) -> dict:
    """A photo of the lesson's work or board on her note: kept in the private store beside the recordings, cleared on the
    same clock (`voice.confirm_within_hours`). A photo of a child is not for here; the file cannot be checked for it, the
    screen says so. A note whose raw copies were cleared takes no more."""
    note = _own_note(conn, email, note_id)
    if note["audio_deleted_at"] is not None or note["transcript_cleared_at"] is not None:
        raise Refused("This note is past the hours its photos are kept.", 409)
    most = int(settings.config(conn, "voice.max_photos_per_note", 6))
    if len(note["photo_keys"]) >= most:
        raise Refused(f"A note keeps at most {most} photos.", 409)
    key = voice_store.photo_key(uuid.uuid4(), filename, dt.datetime.now(dt.UTC).year)
    if not voice_store.looks_like_image(data):
        raise Refused("Not sent. That file is not a photo.", 415)
    conn.execute(
        "update pii.educator_note set photo_keys = photo_keys || %s::text where id = %s", (key, note["id"])
    )
    voice_store.save_photo(key, data)  # after the row, so a refused photo leaves no file behind
    return {"note_id": str(note["id"]), "photos": len(note["photo_keys"]) + 1}


def photo(conn: db.Conn, email: str, note_id: str, index: int) -> tuple[str, bytes]:
    """One of her note's photos, for her to see beside it: (its key's extension, the bytes)."""
    note = _own_note(conn, email, note_id)
    if not 0 <= index < len(note["photo_keys"]):
        raise Refused("There is no such photo.", 404)
    key = note["photo_keys"][index]
    return key.rsplit(".", 1)[1], voice_store.read(key)
