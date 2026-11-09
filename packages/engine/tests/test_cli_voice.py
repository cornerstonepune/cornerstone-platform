"""The voice commands (engine/w3_read/cli_voice.py): what the box's timer runs exists, and `cleanup` and `status` say
counts and words only."""

import os
import re

import pytest
from typer.testing import CliRunner

from engine.cli import app
from engine.core import db
from engine.w3_read import voice_intake

NOTE = db.REPO_ROOT / "docs" / "notes" / "m1-01-voice-intake.md"


def test_every_line_the_box_timer_is_given_runs_a_command_the_engine_has():
    lines = re.findall(r"docker exec deploy-engine-1 engine ([a-z ]+?) >>", NOTE.read_text())
    assert lines == ["read voice expire"]
    for command in lines:
        out = CliRunner().invoke(app, [*command.split(), "--help"])
        assert out.exit_code == 0, (command, out.output)


def test_cleanup_and_status_are_commands_the_engine_has():
    for command in ("read voice cleanup", "read voice status"):
        out = CliRunner().invoke(app, [*command.split(), "--help"])
        assert out.exit_code == 0, (command, out.output)


def test_the_command_keeps_what_was_cleaned_and_exits_1_when_a_recording_could_not_be_deleted(monkeypatch):
    class Conn:
        committed = False

        def commit(self):
            Conn.committed = True

        def rollback(self):
            pass

    class Held:
        def __enter__(self):
            return Conn()

        def __exit__(self, *exc):
            return False

    monkeypatch.setattr(db, "connect", lambda *a, **k: Held())
    monkeypatch.setattr(
        voice_intake,
        "cleanup",
        lambda conn: {"notes": 2, "recordings": 1, "no_note": 0, "left_unconfirmed": 0, "stuck": 1},
    )
    out = CliRunner().invoke(app, ["read", "voice", "cleanup"])
    assert out.exit_code == 1 and "1 recordings could not be deleted" in out.output
    assert Conn.committed, "the note that was cleaned stays cleaned"


@pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")
def test_status_says_sarvams_no_retention_is_not_confirmed_until_it_is_recorded():
    out = CliRunner().invoke(app, ["read", "voice", "status"])
    assert out.exit_code == 0, out.output
    assert "Sarvam no-retention: not confirmed" in out.output
