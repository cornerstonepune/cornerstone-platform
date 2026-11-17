"""W1's functional goal, run as a test: does the engine build the bank on every scenario agreed for it?

`goals/w1-build-the-bank.yaml` states what W1 is for in one sentence and lists the scenarios that prove it (the goal
files stay as history; the runner that read them is gone). The bar is 100%: a scenario that produces 19 of 20 questions
has not met it.
"""

import os

import pytest
import yaml

from engine.checks import scenarios
from engine.core import db

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")

GOAL = yaml.safe_load((db.REPO_ROOT / "goals" / "w1-build-the-bank.yaml").read_text())


@pytest.fixture(scope="module")
def conn():
    with db.connect() as c:
        yield c
        c.rollback()


def test_the_goals_scenarios_are_the_ones_we_agreed():
    """A goal nobody can lose: the scenario list is part of the repository, not a session's memory."""
    assert GOAL["goal"].strip()
    names = [s["name"] for s in GOAL["scenarios"]]
    assert len(names) >= 8 and len(set(names)) == len(names)
    for s in GOAL["scenarios"]:
        assert {"skill_set", "difficulty"} <= s.keys()


def test_every_scenario_meets_the_bar_completely(conn):
    results = scenarios.run(GOAL["scenarios"], conn)
    short = {sc["name"]: failures for sc, _m, failures in results if failures}
    assert not short, f"{len(short)} of {len(results)} scenarios short of the bar: {short}"
