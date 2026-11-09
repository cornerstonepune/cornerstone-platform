"""CP-11: the FET adapter's edges that need no FET and no database (engine/adapters/fet.py, engine/w2_print/tt_generate.py)."""

import subprocess

import pytest

from engine.adapters import fet
from engine.w2_print import tt_generate as gen


def test_a_fet_that_overruns_its_limit_is_kept_as_out_of_time_not_a_crash(monkeypatch):
    def hangs(*args, **kwargs):
        raise subprocess.TimeoutExpired("fet-cl", 1)

    monkeypatch.setattr(fet, "version", lambda: "FET version 0")
    monkeypatch.setattr(fet.subprocess, "run", hangs)
    result = fet.run("<fet/>", 1, 1)
    assert result.timed_out and result.placed == {} and result.output_text is None


def test_a_missing_setting_is_named_not_filled_with_a_default(monkeypatch):
    monkeypatch.setattr(gen.settings, "config", lambda conn, key, default=None: None)
    with pytest.raises(gen.MissingSetting, match="timetable.solve_seconds"):
        gen._setting(None, gen.SOLVE_SECONDS)  # pyright: ignore[reportArgumentType]
