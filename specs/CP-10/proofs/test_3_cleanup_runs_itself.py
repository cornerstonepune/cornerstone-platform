"""CP-10 item 3: the clean-up runs by itself (an n8n schedule calling one engine endpoint at least every 2 hours, with no
Code node and no prompt), is recorded as counts only, fails and is retried when a recording cannot be deleted, never
clears a transcript before its recording is gone, fails and clears nothing when the recordings folder cannot be read,
deletes a recording with no note older than 48 hours, and leaves on each note's own row when its recording was deleted
and when its transcript was cleared (set once, never changed). It runs whether or not the voice switches are on.
The LIVE half is live_voice_cleanup.py (box only)."""

import datetime as dt
import json
import os
import re
import subprocess
import sys
import uuid

import psycopg
import pytest
from conftest import FIXTURE_WORDS, ROOT, TRANSCRIPT, cleanup, confirmed, note_row, received_ago, record, recording_path

from engine.w3_read import voice_confirm

FLOW = ROOT / "n8n" / "workflows" / "f5-voice-cleanup.json"
THINKING = ("n8n-nodes-base.code", "n8n-nodes-base.function", "n8n-nodes-base.functionItem",
            "n8n-nodes-base.executeCommand", "n8n-nodes-base.pythonFunction")


# --- the schedule -------------------------------------------------------------------------------------------------

def _hours_between_runs(node) -> float:
    """The longest gap, in hours, between two runs of an n8n schedule trigger node."""
    rules = (node.get("parameters", {}).get("rule") or {}).get("interval") or [{}]
    gaps = []
    for r in rules:
        field = r.get("field", "days")
        if field == "hours":
            gaps.append(float(r.get("hoursInterval", 1)))
        elif field == "minutes":
            gaps.append(float(r.get("minutesInterval", 5)) / 60)
        elif field == "seconds":
            gaps.append(float(r.get("secondsInterval", 30)) / 3600)
        elif field == "cronExpression":
            parts = str(r.get("expression", "")).split()
            hour = parts[-4] if len(parts) >= 5 else ""
            m = re.fullmatch(r"\*(?:/(\d+))?", hour)
            if m:
                gaps.append(float(m.group(1) or 1))
            elif re.fullmatch(r"\d+(,\d+)*", hour):
                hs = sorted(int(h) for h in hour.split(","))
                gaps.append(float(max(b - a for a, b in zip(hs, hs[1:] + [hs[0] + 24]))))
            else:
                gaps.append(float("inf"))
        else:
            gaps.append(float("inf"))  # days, weeks, months: not every 2 hours
    return min(gaps)


def test_3_an_n8n_schedule_calls_one_engine_endpoint_at_least_every_2_hours_with_no_code_and_no_prompt():
    assert FLOW.is_file(), "n8n/workflows/f5-voice-cleanup.json does not exist"
    wf = json.loads(FLOW.read_text())
    nodes = wf["nodes"]
    triggers = [n for n in nodes if n["type"] == "n8n-nodes-base.scheduleTrigger"]
    assert len(triggers) == 1, "one schedule trigger"
    assert _hours_between_runs(triggers[0]) <= 2, "the schedule runs at least every 2 hours"
    http = [n for n in nodes if n["type"] == "n8n-nodes-base.httpRequest"]
    assert len(http) == 1, "one HTTP node"
    p = http[0]["parameters"]
    assert str(p.get("url", "")).lstrip("=").rstrip("/").endswith("/voice/cleanup"), "it calls /voice/cleanup"
    assert str(p.get("method", "GET")).upper() == "POST"
    assert any(http[0]["name"] in [c["node"] for c in out]
               for out in wf["connections"].get(triggers[0]["name"], {}).get("main", [])), \
        "the schedule hands to the HTTP node"
    assert not [n for n in nodes if n["type"] in THINKING or "langchain" in n["type"]], "no Code node, no model"
    assert all(n["type"] in ("n8n-nodes-base.scheduleTrigger", "n8n-nodes-base.httpRequest",
                             "n8n-nodes-base.stickyNote") for n in nodes), "trigger, call, notes on the canvas only"
    lint = subprocess.run([sys.executable, str(ROOT / "n8n" / "lint.py"), str(FLOW)], capture_output=True, text=True)
    assert lint.returncode == 0, lint.stdout + lint.stderr


# --- runs ---------------------------------------------------------------------------------------------------------

def _old_notes(conn, school, n=2):
    """`n` notes received 49 hours ago: the first confirmed, the rest left as drafts."""
    notes = []
    for i in range(n):
        note = record(conn, school)
        if i == 0:
            voice_confirm.confirm_note(conn, str(note["id"]), school.email, confirmed(school))
        notes.append(note)
    for note in notes:
        received_ago(conn, note["id"], 49)
    conn.commit()
    return notes


def _leaves(v):
    if isinstance(v, dict):
        for x in v.values():
            yield from _leaves(x)
    elif isinstance(v, list):
        for x in v:
            yield from _leaves(x)
    else:
        yield v


def _runs(conn):
    rows = conn.execute("select * from flow_run order by started_at, created_at").fetchall()
    conn.commit()
    return rows


def _failed(conn, r):
    """The run was made and failed: an error answer from the clean-up itself (not a missing route), recorded as one."""
    assert r.status_code >= 400 and r.status_code not in (404, 405, 422), (r.status_code, r.text[:300])
    runs = _runs(conn)
    assert runs and runs[-1]["status"] == "error", "the failed run is recorded as failed"


def _untouched(conn, voice_dir, notes, where=None):
    for note in notes:
        row = note_row(conn, note["id"])
        assert row["transcript"] == TRANSCRIPT, "a transcript was cleared"
        assert row["audio_deleted_at"] is None and row["transcript_cleared_at"] is None, "a note was marked cleaned"
        assert ((where or voice_dir) / note["audio_key"]).exists(), "a recording was deleted"
    conn.commit()


def test_3_each_run_is_recorded_as_counts_only(conn, school, client, voice_dir):
    notes = _old_notes(conn, school)
    before = {r["id"] for r in _runs(conn)}
    r = cleanup(client)
    assert r.status_code == 200, (r.status_code, r.text[:300])
    new = [x for x in _runs(conn) if x["id"] not in before]
    assert len(new) == 1, "one run, one record"
    run = new[0]
    assert run["status"] == "ok" and isinstance(run["result"], dict) and run["result"]
    leaves = list(_leaves(run["result"]))
    assert all(isinstance(v, int) and not isinstance(v, bool) for v in leaves), f"not counts only: {run['result']}"
    recorded = json.dumps([run["result"], run["request"], run["error"]], default=str)
    for note in notes:
        assert str(note["id"]) not in recorded and note["audio_key"] not in recorded, "a note is named in the record"
    assert not any(w in recorded.lower() for w in FIXTURE_WORDS), "a word of the transcript is in the record"


def test_3_a_recording_that_cannot_be_deleted_fails_the_run_and_is_retried_in_the_same_hour(conn, school, client,
                                                                                           voice_dir):
    notes = _old_notes(conn, school)
    stuck = recording_path(voice_dir, notes[0])
    stuck.unlink()
    stuck.mkdir()  # a path that no unlink can remove: the recording "cannot be deleted"
    (stuck / "held").write_bytes(b"x")

    _failed(conn, cleanup(client))  # a recording that cannot be deleted fails the run
    row = note_row(conn, notes[0]["id"])
    assert row["transcript"] == TRANSCRIPT, "the transcript was cleared while its recording was still there"
    assert row["audio_deleted_at"] is None and row["transcript_cleared_at"] is None
    for note in notes:  # never a transcript cleared while its recording is kept
        row = note_row(conn, note["id"])
        assert row["transcript"] is not None or not recording_path(voice_dir, note).exists()
    conn.commit()

    (stuck / "held").unlink()
    stuck.rmdir()
    stuck.write_bytes(b"recording again deletable")
    r = cleanup(client)  # the next run, seconds later: the same hour
    assert r.status_code == 200, (r.status_code, r.text[:300])
    for note in notes:
        row = note_row(conn, note["id"])
        assert not recording_path(voice_dir, note).exists(), "the retry did not delete the recording"
        assert row["transcript"] is None, "the retry did not clear the transcript"
    conn.commit()


@pytest.mark.parametrize("fault", ["folder missing", "a file where the folder should be"])
def test_3_the_run_fails_and_clears_nothing_when_the_recordings_folder_cannot_be_read(conn, school, client, voice_dir,
                                                                                     fault):
    notes = _old_notes(conn, school)
    folder = voice_dir / "voice"
    away = voice_dir.parent / "unmounted"
    away.mkdir()
    folder.rename(away / "voice")  # the disk "unmounted": the folder is gone from where the engine reads it
    if fault != "folder missing":
        folder.write_bytes(b"not a folder")
    _failed(conn, cleanup(client))  # never read as "all deleted"
    _untouched(conn, voice_dir, notes, where=away)


def test_3_a_recording_with_no_note_older_than_48_hours_is_deleted(conn, school, client, voice_dir):
    _old_notes(conn, school, 1)
    year = dt.date.today().year
    old, young = (voice_dir / "voice" / str(year) / f"{uuid.uuid4()}.m4a" for _ in range(2))
    for f, hours in ((old, 49), (young, 47)):
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_bytes(b"orphan")
        at = dt.datetime.now().timestamp() - hours * 3600
        os.utime(f, (at, at))
    r = cleanup(client)
    assert r.status_code == 200, (r.status_code, r.text[:300])
    assert not old.exists(), "a recording with no note older than 48 hours is still kept"
    assert young.exists(), "a recording with no note younger than 48 hours was deleted"


def test_3_each_cleaned_note_keeps_when_its_recording_was_deleted_and_its_transcript_cleared_set_once(
        conn, school, client, voice_dir):
    notes = _old_notes(conn, school)
    young = record(conn, school)
    conn.commit()
    received = {n["id"]: note_row(conn, n["id"])["received_at"] for n in notes}
    r = cleanup(client)
    assert r.status_code == 200, (r.status_code, r.text[:300])
    listed = conn.execute(
        "select id, received_at, audio_deleted_at, transcript_cleared_at from pii.educator_note"
        " where audio_deleted_at is not null or transcript_cleared_at is not null").fetchall()
    assert {x["id"] for x in listed} == {n["id"] for n in notes}, "every cleaned note, and only those, is listed"
    stamps = {}
    for x in listed:
        assert x["received_at"] == received[x["id"]], "its received time stays"
        assert x["audio_deleted_at"] is not None and x["transcript_cleared_at"] is not None
        assert x["transcript_cleared_at"] >= x["audio_deleted_at"], "the transcript went before the recording"
        assert note_row(conn, x["id"])["transcript"] is None, "no content kept"
        stamps[x["id"]] = (x["audio_deleted_at"], x["transcript_cleared_at"])
    y = note_row(conn, young["id"])
    assert (y["audio_deleted_at"], y["transcript_cleared_at"]) == (None, None)
    conn.commit()

    r = cleanup(client)  # a later run
    assert r.status_code == 200, (r.status_code, r.text[:300])
    for nid, was in stamps.items():
        row = note_row(conn, nid)
        assert (row["audio_deleted_at"], row["transcript_cleared_at"]) == was, "a later run changed when"
        for value in ("now() + interval '1 hour'", "null"):
            try:
                with conn.transaction():
                    conn.execute(f"update pii.educator_note set audio_deleted_at = {value},"
                                 f" transcript_cleared_at = {value} where id = %s", (nid,))
            except psycopg.Error:
                pass  # refused: never changed
            row = note_row(conn, nid)
            assert (row["audio_deleted_at"], row["transcript_cleared_at"]) == was, f"changed to {value}"
    conn.rollback()


@pytest.mark.parametrize("on", [False, True])
def test_3_it_runs_whether_or_not_the_voice_switches_are_on(conn, school, client, voice_dir, on):
    for key in ("voice.screens_enabled", "voice.recording_enabled"):
        school.switch(key, on)
    notes = _old_notes(conn, school)
    r = cleanup(client)
    assert r.status_code == 200, (r.status_code, r.text[:300])
    for note in notes:
        assert not recording_path(voice_dir, note).exists()
        assert note_row(conn, note["id"])["transcript"] is None
