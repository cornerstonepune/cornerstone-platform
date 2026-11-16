"""CP-54 B3: the graduate profile in the shape the school chose (definition, groups, "I can…" at each stage, the words),
in Cornerstone's own words, as rows of the framework CS-PROFILE. A change to it is a change of rows, never of code.
"""

import json
import os

import pytest

from engine.core import db, frameworks
from tests.rows import tenant

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")

SEED = json.loads((db.REPO_ROOT / "supabase" / "seed" / "profile.json").read_text())
WORDS = {"capable", "kind", "unafraid"}


@pytest.fixture
def rows():
    with db.connect() as conn:
        t = tenant(conn)
        frameworks.load(conn, t)
        got = conn.execute(
            "select code, kind, parent_code, level_code, text, items, supersedes, area from framework_statement"
            " where tenant_id = %s and framework_code = %s",
            (t, frameworks.PROFILE),
        ).fetchall()
        conn.rollback()
    return got


def _of(rows, kind):
    return [r for r in rows if r["kind"] == kind]


def test_eight_capabilities_each_with_groups_and_each_group_with_a_sentence_at_every_stage(rows):
    caps = [r for r in _of(rows, "capability") if r["code"].startswith("v2-")]
    assert len(caps) == 8
    stages = {r["code"] for r in _of(rows, "level")}
    assert stages == {"Foundational", "Preparatory"}
    groups = [r for r in _of(rows, "group") if r["level_code"] is None]
    for c in caps:
        mine = [g for g in groups if g["parent_code"] == c["code"]]
        assert len(mine) >= 2, c["code"]
        for g in mine:
            assert g["text"].startswith("I can "), g["code"]
            said = {r["level_code"]: r["text"] for r in rows if r["parent_code"] == g["code"]}
            assert set(said) == stages and all(s.startswith("I can ") for s in said.values()), g["code"]


def test_every_group_is_mapped_to_a_word_and_every_word_is_reached_by_three_groups_or_more(rows):
    groups = [r for r in _of(rows, "group") if r["level_code"] is None]
    assert all(g["items"] and set(g["items"]) <= WORDS for g in groups)
    for w in WORDS:
        assert sum(w in g["items"] for g in groups) >= 3, w


def test_the_first_eight_stay_as_rows_and_each_is_superseded_by_one_new_capability(rows):
    old = {r["code"] for r in _of(rows, "capability") if not r["code"].startswith("v2-")}
    assert len(old) == 8
    replaced = [r["supersedes"] for r in _of(rows, "capability") if r["code"].startswith("v2-")]
    assert sorted(replaced) == sorted(old)


def test_the_profile_is_in_our_own_words_and_keeps_learning_and_agency_and_the_checking_of_ai(rows):
    names = " ".join(r["text"] for r in _of(rows, "capability")).lower()
    for theirs in ("flourishing", "discovery", "creativity", "thought", "quantitative"):
        assert theirs not in names
    groups = " ".join(r["area"] or "" for r in _of(rows, "group")).lower()
    assert "learning and agency" in names.replace("&", "and") and "checking before i trust" in groups
    assert any(
        "unafraid" in g["items"] and g["code"].startswith("v2-learning-and-agency")
        for g in _of(rows, "group")
    )
    assert len(SEED["capabilities"]) == 8


def test_no_word_the_school_never_uses(rows):
    text = " ".join(r["text"] or "" for r in rows).lower()
    assert "teacher" not in text and "borrow" not in text
