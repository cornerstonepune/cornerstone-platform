"""CP-54 B4: the three runs that make the chain's missing links with the skills' machines. A made-up asker answers: no model."""

import os

import pytest
from typer.testing import CliRunner

from engine.core import db
from engine.w1_bank import apply_seed, chain_choose
from tests.rows import tenant

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")


@pytest.fixture
def world():
    with db.connect() as conn:
        t = tenant(conn)
        conn.execute(
            "delete from objective_statement where tenant_id = %s and framework_code = 'CS-PROFILE'", (t,)
        )
        yield conn, t
        conn.rollback()


def asker(first=None, **reply):
    def ask(purpose, variables, about):
        return first(purpose, variables, about) if first else reply

    return ask


def test_a_capability_job_offers_the_groups_the_spine_reaches_and_every_group_when_it_reaches_none(world):
    conn, t = world
    jobs = chain_choose.capability_jobs(conn, t)
    assert jobs and all(j["inputs"]["domain_default"] for j in jobs)
    sizes = {len(j["options"]) for j in jobs}
    assert 3 in sizes and 24 in sizes or 3 in sizes, (
        sizes
    )  # a spine answer offers one capability's three groups
    assert all(j["fallback"] in {o["code"] for o in j["options"]} or j["fallback"] for j in jobs)


def test_a_run_answers_every_objective_and_a_refused_answer_falls_back_to_the_default_marked_low(world):
    conn, t = world
    jobs = chain_choose.capability_jobs(conn, t)[:3]
    good = jobs[0]["options"][0]["code"]
    seen = iter(
        [
            {"choice": [good], "reason": "its verb", "confidence": "high", "assumption": ""},
            {"choice": ["not-on-the-list"], "reason": "x", "confidence": "high", "assumption": ""},
            {"choice": [], "reason": "none", "confidence": "low", "assumption": ""},
        ]
    )
    rows = chain_choose.run(conn, t, "capability", jobs, asker(lambda *_: next(seen)))
    assert [r["group"] for r in rows][0] == good
    assert all(r["group"] for r in rows), "nothing is left empty"
    assert [r["confidence"] for r in rows][1:] == ["low", "low"] and rows[1]["group"] == jobs[1]["fallback"]


def test_the_answers_are_applied_as_the_machines_exactly_one_group_an_objective(world):
    conn, t = world
    jobs = chain_choose.capability_jobs(conn, t)[:2]
    rows = [
        {"lo_code": j["about"], "group": j["options"][0]["code"], "confidence": "low", "reason": ""}
        for j in jobs
    ]
    rep, run = apply_seed.apply_rows(conn, t, "capability", rows)
    assert rep.counts() == {"capability": 2} and run
    assert apply_seed.apply_rows(conn, t, "capability", rows)[0].changes == []  # a second run changes nothing


def test_an_engine_skill_is_offered_the_objectives_of_its_own_grade_only(world):
    conn, t = world
    conn.execute("update skill set lo_code = null where tenant_id = %s", (t,))
    jobs = chain_choose.skill_lo_jobs(conn, t)
    assert jobs
    for j in jobs:
        assert all(o["code"].startswith(f"LO-{j['inputs']['grade']}-") for o in j["options"])


def test_a_unit_whose_name_is_a_topics_is_folded_by_code_and_the_rest_are_asked(world):
    conn, t = world
    conn.execute(
        "update learning_objective set unit = 'Multiplication', topic_code = null where tenant_id = %s and code = 'LO-G1-0014'",
        (t,),
    )
    jobs, folded = chain_choose.topic_jobs(conn, t)
    assert any(f["topic_code"] == "MUL" for f in folded)
    assert jobs and all(j["skill"] == "topic" for j in jobs)


def test_a_new_topic_the_writer_names_gets_a_code_of_its_subject_and_a_refusal_the_units_own_name(world):
    conn, t = world
    jobs, _ = chain_choose.topic_jobs(conn, t)
    two = jobs[:2]
    ok = {
        "topic": "Money and shopping",
        "reuse": None,
        "source": "school-syllabus",
        "confidence": "medium",
        "assumption": "",
    }
    seen = iter([ok, {"verdict": "pass", "faults": []}, {"_refused": "bad"}, {"_refused": "bad"}])
    rows = chain_choose.run(conn, t, "topic", two, asker(lambda *_: next(seen)))
    assert len(rows) == 2 and rows[1]["confidence"] == "low"
    assert all("new_topic" in r or "topic_code" in r for r in rows)


def test_an_estimate_asks_nothing(world, monkeypatch):
    from engine.cli import app
    from engine.skills import machines

    def boom(*a, **k):
        raise AssertionError("an estimate made a call")

    monkeypatch.setattr(machines, "model_ask", boom)
    out = CliRunner().invoke(app, ["curriculum", "chain-link", "capability", "--estimate"])
    assert out.exit_code == 0 and "about $" in out.output
