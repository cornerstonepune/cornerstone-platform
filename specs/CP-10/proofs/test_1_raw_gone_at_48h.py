"""CP-10 item 1: 48 hours after a note was received, its recording file and its transcript are gone, confirmed or left
unconfirmed; before 48 hours both are still there. Notes confirmed from now on keep no copy of the transcript's words in
their lines. The clock is the note's received time, set back by the test; nothing waits."""

from conftest import (FIXTURE_WORDS, TRANSCRIPT, cleanup, confirmed, note_row, received_ago, record,
                      recording_path)

from engine.w3_read import voice_confirm

JUST = 60  # seconds either side of the 48 hours


def _four_notes(conn, school):
    """A confirmed and an unconfirmed note just inside 48 hours, and a confirmed and an unconfirmed one just past."""
    notes = {}
    for name in ("confirmed_young", "drafted_young", "confirmed_old", "drafted_old"):
        notes[name] = record(conn, school)
        if name.startswith("confirmed"):
            voice_confirm.confirm_note(conn, str(notes[name]["id"]), school.email, confirmed(school))
    for name, note in notes.items():
        received_ago(conn, note["id"], 48 + (JUST if name.endswith("old") else -JUST) / 3600)
    conn.commit()
    return notes


def test_1_recording_and_transcript_gone_after_48_hours_and_kept_before(conn, school, client, voice_dir):
    notes = _four_notes(conn, school)
    for note in notes.values():
        assert recording_path(voice_dir, note).is_file()
        assert note_row(conn, note["id"])["transcript"] == TRANSCRIPT
    conn.commit()

    r = cleanup(client)
    assert r.status_code == 200, (r.status_code, r.text[:300])

    for name, note in notes.items():
        row = note_row(conn, note["id"])
        assert row is not None, f"{name}: the note's own row stays"
        if name.endswith("old"):
            assert not recording_path(voice_dir, note).exists(), f"{name}: its recording is still kept after 48 hours"
            assert row["transcript"] is None, f"{name}: its transcript is still kept after 48 hours"
        else:
            assert recording_path(voice_dir, note).is_file(), f"{name}: its recording went before 48 hours"
            assert row["transcript"] == TRANSCRIPT, f"{name}: its transcript went before 48 hours"
    conn.commit()


def test_1_a_note_confirmed_now_keeps_no_copy_of_the_transcripts_words_in_its_lines(conn, school):
    note = record(conn, school)
    voice_confirm.confirm_note(conn, str(note["id"]), school.email, confirmed(school))
    lines = conn.execute("select * from pii.note_claim where note_id = %s", (note["id"],)).fetchall()
    assert lines, "her decision on each line is written"
    for line in lines:
        assert not (line["words"] or "").strip(), f"line {line['section']} keeps the transcript's words"
        text = " ".join(str(v) for v in line.values() if isinstance(v, str)).lower()
        assert not any(w in text for w in FIXTURE_WORDS), f"line {line['section']} keeps a word of the transcript"
