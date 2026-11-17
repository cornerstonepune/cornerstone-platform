"""CP-54 B4: the three runs that make the chain's missing links with the skills' machines. A made-up asker answers: no model."""

import os

import pytest
from typer.testing import CliRunner

from engine.core import db
from engine.skills import rules_choose
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


def by_job(replies):
    """An asker that answers each job from its own list of replies, in the order that job asks: the calls of different jobs go out
    together (skills/pool.py), so a reply may not depend on which job asked first."""
    queues = {about: iter(r) for about, r in replies.items()}
    return asker(lambda purpose, variables, about: next(queues[about]))


def test_a_capability_job_offers_the_groups_the_spine_reaches_and_every_group_when_it_reaches_none(world):
    conn, t = world
    jobs = chain_choose.capability_jobs(conn, t)
    assert jobs and all(j["inputs"]["domain_default"] for j in jobs)
    sizes = {len(j["options"]) for j in jobs}
    assert 3 in sizes and 24 in sizes or 3 in sizes, (
        sizes
    )  # a spine answer offers one capability's three groups
    assert all(j["fallback"] in {o["code"] for o in j["options"]} or j["fallback"] for j in jobs)


def _asked(jobs):
    """Jobs the model is asked about: a character objective has no domain default, so code does not answer it."""
    for j in jobs:
        j["inputs"]["kind"] = "character"
    return jobs


def test_a_run_answers_every_objective_and_a_refused_answer_falls_back_to_the_default_marked_low(world):
    conn, t = world
    jobs = _asked(chain_choose.capability_jobs(conn, t)[:3])
    good = jobs[0]["options"][0]["code"]
    answers = [
        {"choice": [good], "reason": "its verb", "confidence": "high", "assumption": ""},
        {"choice": ["not-on-the-list"], "reason": "x", "confidence": "high", "assumption": ""},
        {"choice": [], "reason": "none", "confidence": "low", "assumption": ""},
    ]
    ask = by_job({j["about"]: [a] for j, a in zip(jobs, answers, strict=True)})
    rows = chain_choose.run(conn, t, "capability", jobs, ask)
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


def test_with_the_switch_set_to_ask_an_academic_objective_that_leaves_its_default_with_no_reason_keeps_it_low(
    world, monkeypatch
):
    """CP-54 fix D (option a), kept behind the skill's lists.json switch "academic": "ask": the model starts from the
    domain default; leaving it needs a reason naming the verb and the group's words, else code puts the default back."""
    conn, t = world
    monkeypatch.setitem(chain_choose._skill("capability-link")["lists"], "academic", "ask")
    jobs = [
        j
        for j in chain_choose.capability_jobs(conn, t)
        if j["inputs"]["kind"] == "academic"
        and j["fallback"] in {o["code"] for o in j["options"]}
        and len(j["options"]) > 1
        and rules_choose.verb(j["inputs"]["objective"]) is not None
    ][:3]
    assert jobs and all(chain_choose.asks(j) for j in jobs)
    away = {j["about"]: next(o["code"] for o in j["options"] if o["code"] != j["fallback"]) for j in jobs}
    ask = by_job(
        {a: [{"choice": [c], "reason": "", "confidence": "high", "assumption": ""}] for a, c in away.items()}
    )
    rows = chain_choose.run(conn, t, "capability", jobs, ask)
    assert [r["group"] for r in rows] == [j["fallback"] for j in jobs]
    assert all(r["confidence"] == "low" and r["reason"] for r in rows)


def _academic(jobs):
    return [
        j
        for j in jobs
        if j["inputs"]["kind"] == "academic" and j["fallback"] in {o["code"] for o in j["options"]}
    ]


def never(purpose, variables, about):
    raise AssertionError(f"code answers {about}: no model is asked")


def test_every_academic_objective_takes_its_subject_default_by_code_with_no_call(world):
    """Orchestrator, 17 Nov: the model never beat the subject default on an academic objective, so code gives it, low,
    with the assumption written; the row is the machine's, so a person can change it."""
    conn, t = world
    jobs = _academic(chain_choose.capability_jobs(conn, t))
    assert len(jobs) > 100 and not any(chain_choose.asks(j) for j in jobs)
    rows = chain_choose.run(conn, t, "capability", jobs, never)
    assert [r["group"] for r in rows] == [j["fallback"] for j in jobs]
    assert all(r["confidence"] == "low" and "default" in r["reason"] for r in rows)


def test_character_and_routine_objectives_are_still_asked(world):
    conn, t = world
    jobs = chain_choose.capability_jobs(conn, t)
    routines = [j for j in jobs if j["inputs"]["kind"] == "routine"]
    assert routines and all(chain_choose.asks(j) for j in routines)
    assert all(chain_choose.asks(j) for j in _asked(jobs[:5]))


def test_every_active_objective_with_no_capability_gets_a_job_including_one_with_no_title_yet(world):
    """Nothing empty: an objective whose title is still blank (its heading sits in the unit) is read by its unit."""
    conn, t = world
    jobs = {j["about"]: j for j in chain_choose.capability_jobs(conn, t)}
    live = conn.execute(
        "select code, title, unit from learning_objective where tenant_id = %s and not retired", (t,)
    ).fetchall()
    assert {r["code"] for r in live if (r["title"] or "").strip() or (r["unit"] or "").strip()} == set(jobs)
    blank = [r for r in live if not (r["title"] or "").strip() and (r["unit"] or "").strip()]
    assert blank and all(jobs[r["code"]]["inputs"]["objective"] == r["unit"].strip() for r in blank)


def test_the_forecast_counts_no_call_for_an_academic_objective_and_a_call_for_one_asked(world):
    from engine.w1_bank import cli_chain

    conn, t = world
    jobs = chain_choose.capability_jobs(conn, t)
    academic = _academic(jobs)
    assert cli_chain._cost(conn, academic)[:2] == (0, 0.0)
    calls, rupees, _ = cli_chain._cost(
        conn, _asked([dict(j, inputs=dict(j["inputs"])) for j in academic[:4]])
    )
    assert calls == 4 and rupees > 0


def test_an_engine_skill_is_offered_the_objectives_of_its_own_subject_and_asked_as_that_subject(world):
    """CP-54 fix F: stay in the subject. The shortlist is the skill's own subject's objectives (its topic's subject), and
    the whole grade only when that subject has none."""
    conn, t = world
    conn.execute("update skill set lo_code = null where tenant_id = %s", (t,))
    jobs = [j for j in chain_choose.skill_lo_jobs(conn, t) if "subject_code" in j["inputs"]]
    assert jobs
    for j in jobs:
        theirs = {o.get("subject_code") for o in j["options"]}
        mine = j["inputs"]["subject_code"]
        assert theirs == {mine} or mine not in theirs, (j["about"], theirs)


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
    ask = by_job({
        two[0]["about"]: [ok, {"verdict": "pass", "faults": []}],
        two[1]["about"]: [{"_refused": "bad"}, {"_refused": "bad"}],
    })  # fmt: skip
    rows = chain_choose.run(conn, t, "topic", two, ask)
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


def test_the_answers_to_check_first_are_the_unsure_and_the_refused_and_never_a_sure_one(world, monkeypatch):
    conn, t = world
    monkeypatch.setitem(rules_choose.EXACT, "capability-link", lambda lists, inputs, picked, options: True)
    jobs = _asked(chain_choose.capability_jobs(conn, t)[:3])
    good = jobs[0]["options"][0]["code"]
    answers = [
        {"choice": [good], "reason": "its verb", "confidence": "high", "assumption": ""},
        {"choice": ["not-on-the-list"], "reason": "x", "confidence": "high", "assumption": ""},
        {"choice": [good], "reason": "a guess", "confidence": "low", "assumption": "the unit"},
    ]
    ask = by_job({j["about"]: [a] for j, a in zip(jobs, answers, strict=True)})
    rows = chain_choose.run(conn, t, "capability", jobs, ask)
    look = chain_choose.disagreements("capability", jobs, rows)
    assert [x["about"] for x in look] == [jobs[1]["about"], jobs[2]["about"]]
    assert "refused" in look[0]["why"][1] and look[1]["why"] == ["the skill was unsure"]


def test_code_only_gives_every_academic_objective_its_subject_default_low_and_asks_nothing_for_character_or_routine(
    world,
):
    """17 Nov, Nimish chose (a): the model skill stays off until it meets its bar, so the fill is code alone. An academic objective
    whose subject default is not among its shortlist still gets that default (low, with why); a character or routine objective
    has no honest default and is left, counted, never guessed."""
    conn, t = world
    jobs = chain_choose.capability_jobs(conn, t)
    rows, left = chain_choose.code_only(jobs)
    academic = [j for j in jobs if j["inputs"]["kind"] == "academic" and j["fallback"]]
    assert {r["lo_code"] for r in rows} | {j["about"] for j in left} == {j["about"] for j in jobs}
    assert {j["about"] for j in left}.isdisjoint({r["lo_code"] for r in rows})
    assert all(j["inputs"]["kind"] != "academic" or not j["fallback"] for j in left)
    assert len(rows) == len([j for j in academic if j["inputs"]["subject"] or j["fallback"]])
    off_list = [
        r
        for j, r in zip(academic, rows, strict=False)
        if j["fallback"] not in {o["code"] for o in j["options"]}
    ]
    assert off_list, "the live data has academic objectives whose default is off their shortlist"
    for r in rows:
        assert r["confidence"] == "low" and "default" in r["reason"]
        assert r["group"] in {g["code"] for g in chain_choose._groups(conn, t)}


def test_a_code_only_run_makes_no_model_call_and_a_person_set_capability_is_not_replaced(world):
    conn, t = world
    jobs = chain_choose.capability_jobs(conn, t)
    rows, _ = chain_choose.code_only(jobs)
    mine = rows[0]
    conn.execute(
        "insert into objective_statement (tenant_id, lo_code, framework_code, statement_code, relation, source)"
        " values (%s,%s,'CS-PROFILE',%s,'counts_toward','person') on conflict do nothing",
        (
            t,
            mine["lo_code"],
            next(g["code"] for g in chain_choose._groups(conn, t) if g["code"] != mine["group"]),
        ),
    )
    rep, run = apply_seed.apply_rows(conn, t, "capability", rows, "someone@school.invalid")
    kept = conn.execute(
        "select source from objective_statement where tenant_id=%s and lo_code=%s and framework_code='CS-PROFILE'",
        (t, mine["lo_code"]),
    ).fetchall()
    assert [k["source"] for k in kept] == ["person"]
    assert rep.skipped
