"""CP-30: the screenshot of a Report a problem note, kept privately (specs/CP-30/spec.md).

The picture is a file, `data/feedback/<year>/<note id>.<ext>`, on the engine's disk as recordings are (never in git, a
log, the database or the GitHub issue). Its name is the `staff_note` id, so the note and its picture are linked by id and
nothing else holds them together. It may show a child's name on a screen, so it is deleted after
`feedback.screenshot_days` (30, read with a default). Reads and writes files only; no model, no name."""

import re
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

from engine.core import db, settings
from engine.w3_read import voice_store
from engine.w3_read.voice_store import Refused

FOLDER = "feedback"
KINDS = {".jpg", ".jpeg", ".png", ".webp"}
FILE = re.compile(r"^[0-9a-f-]{36}\.(jpg|png|webp)$")
ADD_FOR_MINUTES = 60  # a picture belongs to the note just sent, not to one found later


def _folder(year: int | None = None) -> Path:
    base = voice_store.ROOT / FOLDER
    return base / str(year) if year else base


def _existing(note_id: str) -> Path | None:
    for f in _folder().glob(f"*/{note_id}.*"):
        if FILE.fullmatch(f.name):
            return f
    return None


def _note(conn: db.Conn, note_id: str) -> dict:
    try:
        uuid.UUID(note_id)
    except ValueError as bad:
        raise Refused("No such note.", 404) from bad
    got = conn.execute(
        "select created_at, now() - created_at as age from staff_note where id = %s", (note_id,)
    ).fetchone()
    if got is None:
        raise Refused("No such note.", 404)
    return got


def keep(conn: db.Conn, note_id: str, filename: str, data: bytes) -> dict:
    """One picture for a note just sent. Nothing is written to the database."""
    note = _note(conn, note_id)
    ext = Path(filename or "").suffix.lower()
    if ext not in KINDS or not voice_store.looks_like_image(data):
        raise Refused("Not kept. That is not a picture this page can keep.", 415)
    if len(data) > voice_store.MOST:
        raise Refused("Not kept. That picture is too large.", 413)
    if note["age"] > timedelta(minutes=ADD_FOR_MINUTES):
        raise Refused("Not kept. A picture is added when the note is sent.", 409)
    if _existing(note_id) is not None:
        raise Refused("This note already has a picture.", 409)
    folder = _folder(datetime.now(UTC).year)
    folder.mkdir(parents=True, exist_ok=True)
    (folder / f"{note_id}{'.jpg' if ext == '.jpeg' else ext}").write_bytes(data)
    return {"kept": True}


def get(conn: db.Conn, note_id: str) -> tuple[str, bytes]:
    _note(conn, note_id)
    found = _existing(note_id)
    if found is None:
        raise Refused("This note has no picture.", 404)
    return found.suffix[1:], found.read_bytes()


def expire(conn: db.Conn) -> int:
    """Delete every picture older than the days a note's picture is kept; how many (a count, nothing else)."""
    days = int(settings.config(conn, "feedback.screenshot_days", 30))
    cut = (datetime.now(UTC) - timedelta(days=days)).timestamp()
    gone = 0
    for f in _folder().glob("*/*"):
        if FILE.fullmatch(f.name) and f.stat().st_mtime <= cut:
            f.unlink(missing_ok=True)
            gone += 1
    return gone
