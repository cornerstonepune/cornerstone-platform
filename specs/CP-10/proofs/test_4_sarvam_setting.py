"""CP-10 item 4: Sarvam's "no retention in writing" is a setting, `voice.sarvam_no_retention_confirmed`, false until a
person on the staff list records it with a written reference, signed and logged under their staff id with the reference.
Turning recording on works with the setting false and never refuses for lack of a reference. A command prints the
setting as "confirmed" or "not confirmed" beside the other voice switches and the last clean-up run.

The commands are run as a person runs them (`engine read voice ...`), in process, against the test's own database."""

import re

from conftest import cleanup, cli

KEY = "voice.sarvam_no_retention_confirmed"
REF = "CP10-PROOF-REF-0042"


def _setting(conn):
    row = conn.execute("select value from config where key = %s", (KEY,)).fetchone()
    conn.commit()
    return None if row is None else row["value"]


def _status():
    code, out = cli("read", "voice", "status")
    assert code == 0, out
    lines = out.splitlines()
    sarvam = [x for x in lines if "sarvam" in x.lower()]
    assert len(sarvam) == 1, f"one line for Sarvam's no-retention setting: {out}"
    return out, lines, sarvam[0]


def _said(line: str) -> str:
    return "not confirmed" if re.search(r"\bnot confirmed\b", line, re.I) else \
        "confirmed" if re.search(r"\bconfirmed\b", line, re.I) else "neither"


def test_4_the_setting_is_false_by_default_and_the_status_says_not_confirmed(conn, school):
    conn.commit()
    assert _setting(conn) is False, f"{KEY} is a setting, false by default"
    out, lines, sarvam = _status()
    assert _said(sarvam) == "not confirmed"
    assert any("screens" in x.lower() for x in lines) and any("recording" in x.lower() for x in lines), \
        "the other voice switches are beside it"
    assert any("clean" in x.lower() for x in lines), "the last clean-up run is beside it"


def test_4_setting_it_on_needs_a_reference_and_a_person_on_the_staff_list_and_is_logged(conn, school):
    conn.commit()
    code, out = cli("read", "voice", "switch", "sarvam", "on", "--by", school.email)
    assert code != 0, "turned on with no reference"
    assert _setting(conn) is False
    code, out = cli("read", "voice", "switch", "sarvam", "on", "--by", "stranger@example.test", "--ref", REF)
    assert code != 0, "turned on by someone not on the staff list"
    assert _setting(conn) is False

    code, out = cli("read", "voice", "switch", "sarvam", "on", "--by", school.email, "--ref", REF)
    assert code == 0, out
    assert _setting(conn) is True
    logged = conn.execute("select actor, action from access_log where action like %s", (f"%{KEY}%",)).fetchall()
    conn.commit()
    assert len(logged) == 1, logged
    assert logged[0]["actor"] == str(school.staff), "signed under the staff id"
    assert REF in logged[0]["action"], "logged with the reference"
    assert school.email not in str(logged) and school.email not in out, "no email in the log or the output"
    assert _said(_status()[2]) == "confirmed"


def test_4_recording_goes_on_with_the_setting_false_and_no_reference(conn, school):
    conn.commit()
    code, out = cli("read", "voice", "switch", "recording", "on", "--by", school.email)
    assert code == 0, out
    row = conn.execute("select value from config where key = 'voice.recording_enabled'").fetchone()
    conn.commit()
    assert row["value"] is True
    assert _setting(conn) is False


def test_4_the_status_shows_the_last_clean_up_run(conn, school, client):
    conn.commit()
    before = [x for x in _status()[1] if "clean" in x.lower()]
    r = cleanup(client)
    assert r.status_code == 200, (r.status_code, r.text[:300])
    after = [x for x in _status()[1] if "clean" in x.lower()]
    assert after and after != before, f"the status does not show the run that just happened: {before} -> {after}"
