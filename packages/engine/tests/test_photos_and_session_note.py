"""A lesson's photos and her note for a lesson (engine/w3_read/voice_class.py), and the clean-up of a note she typed
(voice_intake.cleanup): placeholder rows, a temporary folder as the private store, rolled back."""

import os

import pytest

from engine.core import db
from engine.w3_read import voice_class as vcl
from engine.w3_read import voice_intake, voice_store
from tests.test_voice_class_notes import _session, _today
from tests.voice_rows import a_k2_class

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 20


@pytest.fixture
def conn():
    with db.connect() as c:
        yield c
        c.rollback()


@pytest.fixture
def store(tmp_path, monkeypatch):
    (tmp_path / "voice").mkdir()
    monkeypatch.setattr(voice_store, "ROOT", tmp_path)
    return tmp_path


def _note(conn, k):
    return vcl.create_typed(conn, k["email"], k["class"])


def test_a_photo_is_kept_in_the_private_store_and_listed_on_her_note(conn, store):
    k = a_k2_class(conn)
    note = _note(conn, k)
    out = vcl.add_photo(conn, k["email"], note, "board.JPG", JPEG)
    assert out["photos"] == 1
    key = conn.execute("select photo_keys from pii.educator_note where id = %s", (note,)).fetchone()[
        "photo_keys"
    ][0]
    assert key.startswith("voice/") and key.endswith(".jpg") and (store / key).read_bytes() == JPEG
    ext, data = vcl.photo(conn, k["email"], note, 0)
    assert (ext, data) == ("jpg", JPEG)
    (shown,) = vcl.class_notes(conn, k["email"], k["class"], _today(conn))["notes"]
    assert shown["photos"] == 1


def test_only_a_photo_is_taken_and_only_onto_her_own_note_up_to_the_most(conn, store):
    k, other = a_k2_class(conn), a_k2_class(conn)
    note = _note(conn, k)
    for name, data in (("a.mp3", JPEG), ("a.jpg", b"not a photo"), ("a.jpg", b"")):
        with pytest.raises(voice_store.Refused) as no:
            vcl.add_photo(conn, k["email"], note, name, data)
        assert no.value.status == 415
    with pytest.raises(voice_store.Refused) as no:
        vcl.add_photo(conn, other["email"], note, "a.jpg", JPEG)  # someone else's note
    assert no.value.status == 404
    conn.execute(
        "insert into config (tenant_id, key, value, description) values (%s, 'voice.max_photos_per_note', '2', 't')"
        " on conflict (tenant_id, key) do update set value = excluded.value",
        (k["tenant"],),
    )
    vcl.add_photo(conn, k["email"], note, "a.jpg", JPEG)
    vcl.add_photo(conn, k["email"], note, "b.png", b"\x89PNG\r\n\x1a\n" + b"\x00" * 8)
    with pytest.raises(voice_store.Refused) as no:
        vcl.add_photo(conn, k["email"], note, "c.jpg", JPEG)
    assert no.value.status == 409
    assert not list((store / "voice").rglob("c.*"))


def test_the_clean_up_takes_a_typed_notes_photos_and_does_not_fail_for_it_having_no_recording(conn, store):
    k = a_k2_class(conn)
    note = _note(conn, k)
    vcl.add_photo(conn, k["email"], note, "a.jpg", JPEG)
    conn.execute("alter table pii.educator_note disable trigger educator_note_clock")
    conn.execute(
        "update pii.educator_note set received_at = now() - interval '3 days' where id = %s", (note,)
    )
    conn.execute("alter table pii.educator_note enable trigger educator_note_clock")
    out = voice_intake.cleanup(conn)  # a typed note's audio_key is null: it must not stop the run
    assert out["stuck"] == 0 and out["notes"] >= 1
    row = conn.execute(
        "select photo_keys, audio_deleted_at from pii.educator_note where id = %s", (note,)
    ).fetchone()
    assert row["photo_keys"] == [] and row["audio_deleted_at"] is not None
    assert not list((store / "voice").rglob("*.jpg"))
    with pytest.raises(voice_store.Refused) as no:
        vcl.add_photo(conn, k["email"], note, "late.jpg", JPEG)  # past the hours: no photo is kept for ever
    assert no.value.status == 409


def test_her_note_for_a_lesson_is_the_one_she_has_else_an_empty_one_and_only_for_a_lesson_of_the_class(conn):
    k, other = a_k2_class(conn), a_k2_class(conn)
    lesson = _session(conn, k, _today(conn))
    first = vcl.session_note(conn, k["email"], k["class"], lesson)
    assert vcl.session_note(conn, k["email"], k["class"], lesson) == first
    got = conn.execute(
        "select session_id, audio_key, status from pii.educator_note where id = %s", (first,)
    ).fetchone()
    assert str(got["session_id"]) == lesson and got["audio_key"] is None and got["status"] == "drafted"
    with pytest.raises(voice_store.Refused):
        vcl.session_note(conn, k["email"], k["class"], _session(conn, other, _today(conn)))
