"""CP-10 item 7: no recording, transcript word or name appears in git, or in any log line, response or command output from
recording a note to its clean-up, including a failed run.

One note goes the whole way through the engine's front doors: recorded (POST /voice/notes, with fake audio bytes carrying
a marker), read into words (the fake speech service answers the made-up transcript), its draft opened, confirmed, left
48 hours, a clean-up run that fails (its recording cannot be deleted), the run again, then `engine read voice cleanup`
and `engine read voice status`. Everything is captured: every log record (all loggers, DEBUG and up), stdout and stderr,
every response body, every command's output, and what the runs and switches wrote to the database's ledgers (flow_run,
access_log). The capture is searched for the transcript's made-up words, the audio marker and every made-up name. A hit
names only where it was found, never what.

One response is not searched: the draft, which by design shows the educator her own note's words beside each line so
she can check them before she confirms (the Confirm screen, out of scope). Its route's logs are searched.

The tracked files are searched too: no audio file, and no made-up word or marker outside this spec's own folder."""

import base64
import hashlib
import hmac
import json
import logging
import os
import subprocess
import time

from conftest import (ALL_NAMES, AUDIO, AUDIO_MARKER, FIXTURE_WORDS, KEY, ROOT, TRANSCRIPT, cleanup, cli,
                      fake_speech, post, received_ago, recording_path)

from engine.w3_read import voice_intake

AUDIO_KINDS = (".m4a", ".mp3", ".wav", ".ogg", ".opus", ".webm", ".aac", ".mp4", ".flac")


def _upload_token(email: str) -> str:
    """The token the website signs for her browser (engine/api/deps.py `require_upload_token`)."""
    who = base64.urlsafe_b64encode(email.encode()).decode().rstrip("=")
    body = f"{who}.{int((time.time() + 600) * 1000)}"
    return f"{body}.{hmac.new(KEY.encode(), f'upload.{body}'.encode(), hashlib.sha256).hexdigest()}"


def _leaks(text: str) -> list[str]:
    low = text.lower()
    found = [f"transcript word #{i}" for i, w in enumerate(FIXTURE_WORDS) if w.lower() in low]
    found += ["the recording's bytes"] if AUDIO_MARKER.lower() in low else []
    found += [f"name #{i}" for i, n in enumerate(ALL_NAMES) if n.lower() in low]
    return found


def test_7_nothing_raw_in_logs_responses_or_output_from_recording_to_clean_up(conn, school, client, voice_dir,
                                                                             caplog, capfd):
    caplog.set_level(logging.DEBUG)
    school.switch("voice.screens_enabled", True)
    school.switch("voice.recording_enabled", True)
    conn.commit()
    seen: dict[str, str] = {}

    r = client.post("/voice/notes", files={"file": ("note.m4a", AUDIO, "audio/mp4")},
                    data={"class_id": school.classes["A"]}, headers={"X-Upload-Token": _upload_token(school.email)})
    assert r.status_code == 200, (r.status_code, r.text[:300])
    seen["record"] = r.text
    note_id = r.json()["note_id"]
    os.environ["SARVAM_API_KEY"] = "cp10-fake-key"  # the fake transport never sends it anywhere
    try:
        voice_intake.transcribe(conn, note_id, client=fake_speech(TRANSCRIPT))
    finally:
        os.environ.pop("SARVAM_API_KEY", None)
    conn.commit()
    me = {"actor": school.email, "note_id": note_id}

    r = post(client, "/voice/notes/draft", me)  # her own words, shown to her: not searched (see above)
    assert r.status_code == 200, (r.status_code, r.text[:300])
    assert _leaks(r.text), "the search sees the made-up words where they are meant to be (her draft)"
    r = post(client, "/voice/notes/confirm", {**me, "activity": school.activity, "level": 2,
                                              "lists": {"above": ["1"], "below": ["2"]}, "rest": True})
    assert r.status_code == 200, (r.status_code, r.text[:300])
    seen["confirm"] = r.text

    note = conn.execute("select * from pii.educator_note where id = %s", (note_id,)).fetchone()
    received_ago(conn, note_id, 49)
    conn.commit()
    stuck = recording_path(voice_dir, note)
    stuck.unlink()
    stuck.mkdir()  # the recording cannot be deleted: the run fails
    (stuck / "held").write_bytes(AUDIO)
    r = cleanup(client)
    assert r.status_code >= 400 and r.status_code not in (404, 405, 422), (r.status_code, r.text[:300])
    seen["failed clean-up"] = r.text
    (stuck / "held").unlink()
    stuck.rmdir()
    stuck.write_bytes(AUDIO)
    r = cleanup(client)
    assert r.status_code == 200, (r.status_code, r.text[:300])
    seen["clean-up"] = r.text
    r = post(client, "/voice/notes/draft", me)  # after the clean-up the draft has no words to show
    seen["draft after clean-up"] = r.text

    for args in (("read", "voice", "cleanup"), ("read", "voice", "status")):
        code, out = cli(*args)
        assert code == 0, (args, out[-300:])
        seen[" ".join(args)] = out

    for table, cols in (("flow_run", "flow, request::text, result::text, error"), ("access_log", "actor, action")):
        seen[table] = json.dumps(conn.execute(f"select {cols} from {table}").fetchall(), default=str)
    conn.commit()
    seen["log records"] = "\n".join(f"{x.name} {x.getMessage()} {x.exc_text or ''}" for x in caplog.records)
    out, err = capfd.readouterr()
    seen["stdout"], seen["stderr"] = out, err

    leaks = {where: found for where, text in seen.items() if (found := _leaks(text))}
    assert not leaks, f"raw content found in: {leaks}"
    assert not stuck.exists() and conn.execute("select transcript from pii.educator_note where id = %s",
                                               (note_id,)).fetchone()["transcript"] is None, "the clean-up ran"


def test_7_no_recording_and_no_fixture_word_in_the_tracked_files():
    tracked = subprocess.run(["git", "ls-files", "-z"], cwd=ROOT, capture_output=True, check=True).stdout.split(b"\0")
    audio = [p for p in tracked if p.decode(errors="replace").lower().endswith(AUDIO_KINDS)]
    assert not audio, f"{len(audio)} audio files are tracked"
    for word in (*FIXTURE_WORDS, AUDIO_MARKER):
        hit = subprocess.run(["git", "grep", "-l", "-i", "-F", "-e", word, "--", ".", ":!specs/CP-10"], cwd=ROOT,
                             capture_output=True, text=True)
        assert hit.returncode == 1, f"a made-up fixture word is in tracked files: {hit.stdout.split()}"
    ignored = subprocess.run(["git", "check-ignore", "-q", "data/voice/2026/00000000-0000-0000-0000-000000000000.m4a"],
                             cwd=ROOT)
    assert ignored.returncode == 0, "the recordings folder is not ignored by git"
