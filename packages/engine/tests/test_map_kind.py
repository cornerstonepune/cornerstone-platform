"""Proposing for only the activities that have no skill link (goals/m1-12r-map-bar-and-count.yaml).

`propose` called the proposer for every activity with any gap (871 on live: most lack only an objective or level words,
which the page drafting and the people fill), and its estimate priced all of them. Nimish's 281 are the activities with no
skill link; `--kind skill` calls the proposer for those, records only their skills, and prices exactly them."""

import os

import pytest
from typer.testing import CliRunner

from engine import cli
from engine.w1_bank import cli_map
from engine.w1_bank.map_agents import read_band
from tests.test_map_ledger import BAND, _activity, _band
from tests.test_map_ledger import conn as conn  # the fixture, named so these tests can use it

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")


def world(conn):
    t = _band(conn)
    # a skill and level words but no objective: a gap, but not a skill gap
    _activity(conn, t, "ACT-KX-0201", "Maths", "Has a skill only", skills=["NUM.CNT.01"])
    return t, read_band(conn, t, BAND)


def test_the_activities_to_propose_for_are_those_with_any_gap_or_with_a_skill_gap(conn):
    t, b = world(conn)
    every = cli_map.to_propose(b, set())
    skill = cli_map.to_propose(b, set(), "skill")
    assert "ACT-KX-0201" in every and "ACT-KX-0201" not in skill
    assert set(skill) < set(every) and {"ACT-KX-0101", "ACT-KX-0102", "ACT-KX-0103"} <= set(skill)


def test_an_activity_already_proposed_for_is_not_proposed_for_again_either_way(conn):
    _, b = world(conn)
    done = {("skill", "ACT-KX-0102", "")}
    assert "ACT-KX-0102" not in cli_map.to_propose(b, done, "skill")
    assert "ACT-KX-0102" not in cli_map.to_propose(b, done)


def test_a_kind_that_is_not_skill_is_refused():
    got = CliRunner().invoke(cli.app, ["curriculum", "propose", "--estimate", "--kind", "levels"])
    assert got.exit_code != 0


def test_with_a_kind_only_the_skills_and_their_offers_are_kept_and_with_none_everything_is():
    from dataclasses import replace

    from tests.test_map_replay import prop

    base = prop("A", ["NUM.CNT.01"], "auto_passed")
    made = [replace(base, kind=k) for k in ("skill", "skill_offer", "objective", "levels", "lo_skill")]
    assert [p.kind for p in cli_map.only_kind(made, "skill")] == ["skill", "skill_offer"]
    assert cli_map.only_kind(made, "") == made


def test_the_estimate_says_the_count_and_what_the_proposer_costs():
    from engine.w1_bank.map_scope import estimate_line

    line = estimate_line(281, 0.0117, 400)
    assert line.startswith("281 activities to propose for") and line.endswith("so about $3.29")
    assert "not measured" in estimate_line(281, None, 0)


def _seed(name):
    import json

    from engine.core import db as _db

    return json.loads((_db.REPO_ROOT / "supabase" / "seed" / name).read_text())


def test_the_bars_are_the_ones_nimish_accepted_and_the_proposer_v3_alone_is_on():
    bars = {
        t["key"]: t["value"]
        for t in _seed("thresholds.json")["thresholds"]
        if t["key"].startswith("eval.curriculum_map.")
    }
    assert bars == {
        "eval.curriculum_map.skill_all_right": 0.8,
        "eval.curriculum_map.skill_found": 0.75,
        "eval.curriculum_map.auto_passed": 0.6,
    }
    flags = {
        (p["purpose"], p["version"]): p["active"]
        for p in _seed("prompts.json")["prompts"]
        if p["purpose"].startswith("curriculum_map")
    }
    assert [k for k, on in flags.items() if on] == [("curriculum_map_propose", 3)], "the validator stays off"
    use_checker = next(t for t in _seed("thresholds.json")["thresholds"] if t["key"] == "map.use_checker")
    assert use_checker["value"] == 0


def test_the_score_that_switched_the_proposer_on_is_on_record():
    from engine.core import db as _db

    log = (_db.REPO_ROOT / "DECISIONS-LOG.md").read_text()
    row = next(
        ln for ln in log.splitlines() if ln.startswith("| 2026-11-08") and "curriculum_map_propose" in ln
    )
    for number in ("245", "0.80", "0.732", "0.854", "0.784", "0.673"):
        assert number in row, number
