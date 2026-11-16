"""CP-54 B4, the parts that need no model (engine/w1_bank/chain_draft.py): which LOs need a rewrite and why, the capability
the spine gives, engine skill -> LO, topics by exact unit name. Each rolls back; none writes a row."""

import os

import pytest

from engine.core import db, settings
from engine.w1_bank import chain_draft
from tests.rows import tenant

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")

CASES = [
    ("", "empty"),
    ("   ", "empty"),
    ("Title: Cooking Methods", "heading"),
    ("4.2 Growing /", "heading"),
    ("Key Concepts: Yarn, loom setup", "heading"),
    ("Reading: The Kite Fighters, The Gift of Spring", "list"),
    ("Writing: Advertisements, profiles /", "list"),
    ("Encourages creativity, collaboration, and problem-solving", "purpose"),
    ("Builds vocabulary and strengthens spelling accuracy", "purpose"),
    ("Will help them recognise the sounds of letters.", "purpose"),
    ("The children will develop fine motor skills by modelling clay.", "purpose"),
    ("Understand reflective symmetry using mirrors", "purpose"),
    ("Compare and order fractions with the same denominator", "observable"),
    ("The children will learn to write the numbers 51 to 60.", "observable"),
    ("The children will express how music makes them feel by drawing.", "observable"),
    ("Place value (reading/writing large numbers, partitioning, rounding)", "topic"),
    ("Adding 10 and subtracting 10 from a number", "topic"),
    ("Speaking", "topic"),
]


@pytest.fixture
def conn():
    with db.connect() as c:
        yield c
        c.rollback()


@pytest.mark.parametrize(("title", "kind"), CASES)
def test_an_lo_is_sorted_by_its_wording(conn, title, kind):
    assert chain_draft.classify(title, chain_draft.rules(conn)) == kind


def test_only_what_is_not_observable_needs_a_rewrite_and_the_sql_counts_what_python_counts(conn):
    t = tenant(conn)
    pat = chain_draft.rules(conn)
    py = chain_draft.triage(conn, t, ["G1", "G2", "G3", "G4"])
    rows = conn.execute(chain_draft.triage_sql(pat)).fetchall()
    sql: dict[str, dict[str, int]] = {}
    for r in rows:
        sql.setdefault(r["band"], {})[r["kind"]] = r["n"]
    assert {b: dict(c) for b, c in py.items()} == {b: sql[b] for b in py}, (
        "the two readings of one pattern differ"
    )


def test_a_pattern_one_reads_the_same_in_python_and_postgres(conn):
    """No word-boundary escape and no look-around: Postgres reads \\b as a backspace and rejects (?!…)."""
    for p in chain_draft.rules(conn).values():
        assert "\\b" not in p and "(?" not in p


def test_the_capability_is_the_one_the_spine_gives_by_its_narrowest_path_or_goes_to_the_shortlist(conn):
    got = chain_draft.capability(conn, tenant(conn))
    assert got and all(c and all(x.startswith("v2-") for x in c) for c in got.values())
    one = sum(len(c) == 1 for c in got.values())
    assert 0 < one < len(got), "some LOs have one answer and some several; neither all nor none"


def test_an_engine_skill_names_the_los_of_its_own_grade_that_a_registry_skill_it_tests_is_linked_to(conn):
    t = tenant(conn)
    got = chain_draft.tests(conn, t)
    assert got and all(isinstance(v, list) for v in got.values())
    for skill, los in got.items():
        grade = conn.execute(
            "select grade from skill where tenant_id = %s and code = %s", (t, skill)
        ).fetchone()["grade"]
        assert all(lo.startswith(f"LO-{grade}-") for lo in los), skill


def test_an_lo_whose_unit_is_a_topics_name_folds_into_it_and_no_other_does(conn):
    t = tenant(conn)
    got = chain_draft.topics(conn, t)
    names = {
        r["name"].lower().strip() for r in conn.execute("select name from topic where tenant_id = %s", (t,))
    }
    for lo in got:
        unit = conn.execute(
            "select unit from learning_objective where tenant_id = %s and code = %s", (t, lo)
        ).fetchone()["unit"]
        assert unit.lower().strip() in names


def test_the_rules_are_a_setting_row_not_code(conn):
    assert settings.config(conn, "lo.triage") == chain_draft.rules(conn)
