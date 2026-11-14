"""CP-52: each planner line the model found no activity for is either routine (a recorded verdict, no activity, no skill)
or a teaching line given a new activity of the machine's (`w2_print/plan_author.py`). A placeholder K2 class, a fake
model, a rolled-back transaction: no school data."""

import json
import uuid

import pytest

from engine.w2_print import plan_author as pa
from engine.w2_print import plan_match as pm
from tests import test_plan_match as base

conn, world = base.conn, base.world  # the fixtures

pytestmark = pytest.mark.usefixtures("routine")


@pytest.fixture
def routine(world):
    conn, *_ = world
    conn.execute(
        "update config set value = %s::jsonb where key = 'plan.routine'",
        (json.dumps({"keys": ["prayer"], "words": ["annual day", "revision"]}),),
    )


def answered_none(world, key: str) -> pa.Gap:
    """The line of `key` as the matching run left it: answered none."""
    conn, t, acts, ids, tag = world
    lead = conn.execute("select staff_id from pii.staff limit 1").fetchone()
    staff = lead["staff_id"] if lead else None
    (line,) = [x for x in pm.lines(conn, t, "K2") if x.key == key]
    a = pm.Answer(line, pm.shortlist(conn, t, "K2", line))
    pm.record(conn, t, uuid.uuid4(), a, staff, "plan_line_match v1")
    (gap,) = [g for g in pa.gaps(conn, t, "K2") if g.key == key]
    return gap


def fake(kind: str):
    calls = []

    def ask(variables, about):
        calls.append(variables)
        return {"kind": kind, "reason": "the words"}

    ask.calls = calls  # type: ignore[attr-defined]
    return ask


def test_only_lines_answered_none_and_not_yet_settled_are_gaps(world):
    conn, t, acts, ids, tag = world
    assert pa.gaps(conn, t, "K2") == [], "a line nobody has asked about is the matching run's, not a gap"
    gap = answered_none(world, "events")
    assert (gap.key, gap.text, set(gap.ids)) == ("events", "Annual Day", {ids["day"]})


def test_a_routine_subject_or_word_is_routine_by_code_with_no_call(world):
    gap = answered_none(world, "events")  # "Annual Day": a routine word in config
    ask = fake("teaching")
    v = pa.classify(world[0], gap, ask)
    assert (v.kind, v.by, ask.calls) == ("routine", "code", [])


def test_any_other_line_is_asked_from_a_closed_list_and_a_word_off_it_is_refused(world):
    conn = world[0]
    gap = answered_none(world, "math")  # "Count beads": no routine word
    v = pa.classify(conn, gap, fake("teaching"))
    assert (v.kind, v.by, v.problems) == ("teaching", "plan_line_kind v1", [])
    bad = pa.classify(conn, gap, fake("lesson"))
    assert bad.kind is None and bad.problems == ["lesson is not one of teaching, routine"]


def test_a_routine_line_is_a_recorded_verdict_with_no_activity_and_is_settled(world):
    conn, t, acts, ids, tag = world
    gap = answered_none(world, "events")
    before = conn.execute("select count(*) as n from activity where tenant_id = %s", (t,)).fetchone()["n"]
    run = uuid.uuid4()
    pa.settle(conn, t, run, gap, pa.classify(conn, gap, fake("teaching")), None, "machine:plan_author", "K2")
    assert (
        conn.execute("select count(*) as n from activity where tenant_id = %s", (t,)).fetchone()["n"]
        == before
    )
    p = conn.execute("select status, proposal from curriculum_proposal where run_id = %s", (run,)).fetchone()
    assert (p["status"], p["proposal"]["routine"], p["proposal"]["activity"]) == ("auto_passed", True, None)
    assert pa.gaps(conn, t, "K2") == [], "a settled line is not asked again"


def test_a_teaching_line_gets_a_new_activity_of_the_machines_linked_by_model_in_one_run_undo_reverses(world):
    conn, t, acts, ids, tag = world
    gap = answered_none(world, "math")
    run = uuid.uuid4()
    code = pa.settle(
        conn, t, run, gap, pa.classify(conn, gap, fake("teaching")), None, "machine:plan_author", "K2"
    )
    a = conn.execute("select * from activity where tenant_id = %s and code = %s", (t, code)).fetchone()
    assert code.startswith("ACT-K2-M") and (a["name"], a["strand"], a["band"]) == (
        "Count beads",
        f"Maths{tag}",
        "K2",
    )
    assert a["source_file"] == pa.MADE_BY
    assert not conn.execute("select 1 from activity_skill where activity_code = %s", (code,)).fetchone()
    entry = conn.execute(
        "select activity_id, link_rule, link_run from plan_entry where id = %s", (ids["count"],)
    ).fetchone()
    assert (entry["activity_id"], entry["link_rule"], entry["link_run"]) == (a["id"], "model", run)
    assert conn.execute("select plan_link_undo(%s, 'test') as n", (run,)).fetchone()["n"] == 1
    # the next one takes the next number; a second run never reuses a code
    assert pa.next_code(conn, t, "K2") == f"ACT-K2-M{int(code[-4:]) + 1:04d}"


def test_a_line_whose_subject_has_no_strand_is_refused_not_given_an_activity(world):
    conn, t, acts, ids, tag = world
    conn.execute("update config set value = '{}'::jsonb where key = 'plan.routine'")
    gap = answered_none(world, "events")  # events has no strand in this world's plan.key_strands
    run = uuid.uuid4()
    assert pa.settle(conn, t, run, gap, pa.classify(conn, gap, fake("teaching")), None, "m", "K2") is None
    p = conn.execute("select status, problems from curriculum_proposal where run_id = %s", (run,)).fetchone()
    assert p["status"] == "rejected" and "plan.key_strands" in p["problems"][0]


def test_the_classifier_prompt_is_a_row_with_a_closed_list(conn):
    row = conn.execute(
        "select text, json_schema from prompt where purpose = %s and version = 1", (pa.PURPOSE,)
    ).fetchone()
    assert row is not None and "{{line}}" in row["text"]
    assert row["json_schema"]["properties"]["kind"]["enum"] == list(pa.KINDS)


def test_a_settling_a_person_moved_on_counts_no_longer_and_the_line_is_a_gap_again(world):
    conn, t, acts, ids, tag = world
    gap = answered_none(world, "events")
    run = uuid.uuid4()
    pa.settle(conn, t, run, gap, pa.classify(conn, gap, fake("teaching")), None, "machine:plan_author", "K2")
    (p,) = conn.execute("select id from curriculum_proposal where run_id = %s", (run,)).fetchall()
    conn.execute(
        "insert into curriculum_proposal (tenant_id, about, run_id, kind, subject_code, status, reason, machine)"
        " values (%s, %s, %s, 'plan_link', 'x', 'reverted', 'a person: not routine', 'test')",
        (t, p["id"], uuid.uuid4()),
    )
    assert [g.text for g in pa.gaps(conn, t, "K2")] == ["Annual Day"]
