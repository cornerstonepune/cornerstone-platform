"""`engine audit`'s invariants: the pure ones without a database, then every invariant over the test database's rows
(the sweep that answers "what else is wrong that nothing looks at?"; was tests/test_goal.py until the goal runner went)."""

import os
from collections import Counter

import pytest

from engine.checks import audit
from engine.checks.audit import lopsided
from engine.core import db

RULE = {"share": 0.75, "min_questions": 40}


def test_a_level_whose_right_answers_all_sit_in_one_place_is_named():
    places = {("ESTIMATE.HUNDRED", "Hard", "choose_estimate", "pick"): Counter({1: 54})}
    assert lopsided(places, RULE) == [
        "ESTIMATE.HUNDRED Hard choose_estimate (pick): 54 of 54 right answers are option 2"
    ]


def test_answers_spread_fairly_or_too_few_to_judge_are_not():
    places = {
        ("EQUALITY.INVERSE", "Medium", "equation", "tf"): Counter({0: 28, 1: 26}),
        ("ESTIMATE.HUNDRED", "Easy", "possible_answer", "could"): Counter({1: 30, 0: 24}),
        ("MISSING.DIGIT", "Easy", "equation", "s1"): Counter({0: 12}),
    }
    assert lopsided(places, RULE) == []


def test_the_audit_says_each_check_as_it_finishes(monkeypatch):
    """Found 2026-10-12: `bin/update-live` sat silent for many minutes on `engine audit`, which printed nothing until all
    nineteen checks were done, and looked stuck. Each check is said as it finishes: the next is not run before."""
    from engine.checks import audit

    ran = []
    monkeypatch.setattr(
        audit,
        "INVARIANTS",
        [("first", lambda c: ran.append(1) or []), ("second", lambda c: ran.append(2) or ["x"])],
    )
    checks = audit.each(object())
    assert next(checks) == ("first", []) and ran == [1]
    assert next(checks) == ("second", ["x"]) and ran == [1, 2]
    assert audit.run(object()) == [("first", []), ("second", ["x"])]


@pytest.fixture(scope="module")
def conn():
    if not os.getenv("DATABASE_URL"):
        pytest.skip("needs DATABASE_URL (see .env.example)")
    with db.connect() as c:
        yield c
        c.rollback()


def test_every_invariant_holds(conn):
    """Every invariant code can keep. The ones a person closes (an approval) are counted by `engine audit`, not here."""
    broken = {name: v for name, v in audit.run(conn) if v and name not in audit.AWAITS_A_PERSON}
    assert not broken, f"invariants violated: { {k: v[:3] for k, v in broken.items()} }"


def test_an_invariant_that_waits_for_a_person_says_so_in_words(conn):
    waiting = {name: v for name, v in audit.run(conn) if v and name in audit.AWAITS_A_PERSON}
    assert all(isinstance(line, str) and line for v in waiting.values() for line in v)
    assert audit.AWAITS_A_PERSON <= {name for name, _ in audit.INVARIANTS}
