"""`engine read voice switch screens|recording|sarvam on|off --by <email>` (engine/w3_read/voice_switch.py): the K2 voice
switches turned by a command that says who turned them, never by hand on live. Recording does not need Sarvam's letter;
Sarvam's written "No retention" (D-065) is a recorded setting that needs its reference (CP-10). Placeholder rows only
(tests/voice_rows.py)."""

import os

import pytest
from typer.testing import CliRunner

from engine.cli import app
from engine.core import db, settings
from engine.w3_read import voice_switch
from tests.voice_rows import a_k2_class

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")


@pytest.fixture
def conn():
    with db.connect() as c:
        yield c
        c.rollback()


class _held:
    """The test's own connection, handed to the command; never closed or committed by it."""

    def __init__(self, conn):
        self.conn = conn

    def __enter__(self):
        return self.conn

    def __exit__(self, *exc):
        return False


def _logged(conn, staff) -> list[str]:
    return [
        r["action"]
        for r in conn.execute(
            "select action from access_log where actor = %s and action like 'voice.%%' order by occurred_at, id",
            (str(staff),),
        ).fetchall()
    ]


def test_a_member_of_staff_turns_the_screens_on_and_off_and_each_turn_is_logged_by_staff_id(conn):
    k = a_k2_class(conn)
    said = voice_switch.switch(conn, "screens", True, k["email"])
    assert settings.config(conn, "voice.screens_enabled", False) is True
    assert k["email"] not in said
    voice_switch.switch(conn, "screens", False, k["email"])
    assert settings.config(conn, "voice.screens_enabled", True) is False
    assert _logged(conn, k["staff"]) == ["voice.screens_enabled on", "voice.screens_enabled off"]


def test_recording_goes_on_without_a_reference_and_sarvams_no_retention_is_a_record_that_needs_one(conn):
    k = a_k2_class(conn)
    conn.execute("delete from config where key = 'voice.recording_enabled'")
    voice_switch.switch(
        conn, "recording", True, k["email"]
    )  # never refused for lack of Sarvam's letter (CP-10)
    assert settings.config(conn, "voice.recording_enabled", False) is True
    for ref in (None, "", "   "):
        with pytest.raises(ValueError, match="--ref"):
            voice_switch.switch(conn, "sarvam", True, k["email"], ref)
    assert settings.config(conn, "voice.sarvam_no_retention_confirmed", False) is False
    voice_switch.switch(conn, "sarvam", True, k["email"], "Sarvam email 2026-11-10")
    assert settings.config(conn, "voice.sarvam_no_retention_confirmed", False) is True
    assert _logged(conn, k["staff"]) == [
        "voice.recording_enabled on",
        "voice.sarvam_no_retention_confirmed on, ref: Sarvam email 2026-11-10",
    ]
    voice_switch.switch(conn, "recording", False, k["email"])  # off needs no reference
    assert settings.config(conn, "voice.recording_enabled", True) is False


def test_someone_not_on_the_staff_tables_changes_nothing(conn):
    before = settings.config(conn, "voice.screens_enabled", False)
    with pytest.raises(ValueError, match="--by must be the email you sign in with"):
        voice_switch.switch(conn, "screens", not before, "nobody@example.test")
    assert settings.config(conn, "voice.screens_enabled", False) is before


def test_the_command_turns_a_switch_and_prints_no_email(conn, monkeypatch):
    monkeypatch.setattr(db, "connect", lambda *a, **k: _held(conn))
    k = a_k2_class(conn)
    out = CliRunner().invoke(app, ["read", "voice", "switch", "screens", "on", "--by", k["email"]])
    assert out.exit_code == 0, out.output
    assert "voice.screens_enabled: on" in out.output and k["email"] not in out.output
    refused = CliRunner().invoke(app, ["read", "voice", "switch", "sarvam", "on", "--by", k["email"]])
    assert refused.exit_code != 0 and "--ref" in refused.output
    wrong = CliRunner().invoke(app, ["read", "voice", "switch", "lights", "on", "--by", k["email"]])
    assert wrong.exit_code != 0
