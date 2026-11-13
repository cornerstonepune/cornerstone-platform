"""CP-48 part 2: a plan line linked by a model to one activity code shortlisted (`w2_print/plan_match.py`), or none.
A placeholder K2 class and activities (tests/voice_rows.py), a fake model, a rolled-back transaction: no school data."""

import datetime as dt
import json
import os
import uuid

import pytest

from engine.core import db
from engine.w2_print import plan_match as pm
from tests.voice_rows import a_k2_class

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")


@pytest.fixture
def conn():
    with db.connect() as c:
        yield c
        c.rollback()


@pytest.fixture
def world(conn):
    k = a_k2_class(conn)
    t, tag = k["tenant"], uuid.uuid4().hex[:6]
    conn.execute(
        "delete from plan_entry pe using school_class sc where sc.id = pe.school_class_id and sc.grade_code = 'K2'"
    )
    conn.execute(
        "update config set value = %s::jsonb where key = 'plan.key_strands'",
        (json.dumps({"art": [f"Art{tag}"], "math": [f"Maths{tag}"]}),),
    )
    conn.execute("update config set value = '2'::jsonb where key = 'plan.shortlist_size'")
    acts = {}
    for code, strand, name in [
        ("BOAT", f"Art{tag}", "Paper boat folding"),
        ("TULIP", f"Art{tag}", "Tulip making using craft paper"),
        ("MASK", f"Art{tag}", "Animal mask"),
        ("COUNT", f"Maths{tag}", "Counting beads to ten"),
        ("OTHER", "Music", "Paper boat song"),
    ]:
        acts[code] = conn.execute(
            "insert into activity (tenant_id, code, band, strand, name) values (%s, %s, 'K2', %s, %s) returning id::text",
            (t, f"ACT-K2-{code}{tag}", strand, name),
        ).fetchone()["id"]
    year = conn.execute("select academic_year_id from school_class where id = %s", (k["class"],)).fetchone()[
        "academic_year_id"
    ]
    fn = conn.execute(
        "insert into fortnight (tenant_id, academic_year_id, number, kind, starts_on, ends_on)"
        " values (%s, %s, 911, 'teaching', %s, %s) returning id",
        (t, year, dt.date(2031, 6, 2), dt.date(2031, 6, 15)),
    ).fetchone()["id"]

    def line(key, text, ord_):
        return conn.execute(
            "insert into plan_entry (tenant_id, school_class_id, fortnight_id, plan_key, ord, text, source)"
            " values (%s,%s,%s,%s,%s,%s,'test') returning id::text",
            (t, k["class"], fn, key, ord_, text),
        ).fetchone()["id"]

    ids = {"boat": line("art", "Product driven art - colour paper boat", 1), "boat2": line("art", "Product driven art - colour paper boat", 2),
           "day": line("events", "Annual Day", 3), "count": line("math", "Count beads", 4)}  # fmt: skip
    return conn, t, acts, ids, tag


def fake(choice: dict[str, str]):
    calls = []

    def ask(variables, about):
        calls.append(variables)
        return {"activity_code": choice.get(about, ""), "confidence": 0.9, "reason": "the words"}

    ask.calls = calls  # type: ignore[attr-defined]
    return ask


def test_the_shortlist_is_the_subjects_strands_closest_words_first_and_its_size_is_a_row(world):
    conn, t, acts, ids, tag = world
    (boat,) = [x for x in pm.lines(conn, t, "K2") if x.key == "art"]
    assert len(boat.ids) == 2, "one question for every plan entry with the same words"
    short = pm.shortlist(conn, t, "K2", boat)
    assert [a["code"] for a in short] == [
        f"ACT-K2-BOAT{tag}",
        f"ACT-K2-TULIP{tag}",
    ]  # Music's boat song is not art


def test_a_subject_with_no_strand_is_none_with_no_call(world):
    conn, t, acts, ids, tag = world
    (day,) = [x for x in pm.lines(conn, t, "K2") if x.key == "events"]
    ask = fake({})
    a = pm.answer(conn, t, "K2", day, ask)
    assert a.activity is None and not ask.calls and "plan.key_strands" in a.reason


def test_a_chosen_code_links_every_entry_as_the_models_in_one_run_that_undo_reverses(world):
    conn, t, acts, ids, tag = world
    lead = conn.execute("select staff_id from pii.staff limit 1").fetchone()["staff_id"]
    run = uuid.uuid4()
    (boat,) = [x for x in pm.lines(conn, t, "K2") if x.key == "art"]
    a = pm.answer(conn, t, "K2", boat, fake({boat.text: f"ACT-K2-BOAT{tag}"}))
    pm.record(conn, t, run, a, lead, "plan_line_match v1")
    assert pm.link(conn, run, a, "machine:plan_line_match") == 2
    rows = conn.execute(
        "select activity_id::text, link_rule, link_run from plan_entry where id = any(%s::uuid[])",
        ([ids["boat"], ids["boat2"]],),
    ).fetchall()
    assert {(r["activity_id"], r["link_rule"], r["link_run"]) for r in rows} == {(acts["BOAT"], "model", run)}
    prop = conn.execute(
        "select kind, status, proposal from curriculum_proposal where run_id = %s", (run,)
    ).fetchone()
    assert (prop["kind"], prop["status"], prop["proposal"]["activity"]) == (
        "plan_link",
        "auto_passed",
        f"ACT-K2-BOAT{tag}",
    )
    # a person's edit since makes that entry theirs; the undo leaves it
    conn.execute("update plan_entry set activity_id = %s where id = %s", (acts["TULIP"], ids["boat2"]))
    assert conn.execute("select plan_link_undo(%s, 'test') as n", (run,)).fetchone()["n"] == 1
    left = conn.execute("select link_rule from plan_entry where id = %s", (ids["boat2"],)).fetchone()
    assert left["link_rule"] == "person"


def test_a_code_not_on_the_shortlist_is_refused_and_links_nothing(world):
    conn, t, acts, ids, tag = world
    (boat,) = [x for x in pm.lines(conn, t, "K2") if x.key == "art"]
    a = pm.answer(conn, t, "K2", boat, fake({boat.text: f"ACT-K2-OTHER{tag}"}))
    assert a.activity is None and a.problems == [
        f"ACT-K2-OTHER{tag} is not on the shortlist this line was given"
    ]
    assert pm.link(conn, uuid.uuid4(), a, "machine") == 0


def test_none_is_an_answer_and_links_nothing(world):
    conn, t, acts, ids, tag = world
    (count,) = [x for x in pm.lines(conn, t, "K2") if x.key == "math"]
    a = pm.answer(conn, t, "K2", count, fake({}))
    assert a.activity is None and not a.problems and pm.link(conn, uuid.uuid4(), a, "machine") == 0


def test_gold_scores_the_shortlist_and_the_choice_against_the_schools_own_links(world):
    conn, t, acts, ids, tag = world
    conn.execute(
        "update plan_entry set activity_id = %s, link_rule = 'exact_name', link_run = gen_random_uuid() where id = %s",
        (acts["COUNT"], ids["count"]),
    )
    gold = pm.gold_links(conn, t, "K2")
    todo = pm.lines(conn, t, "K2", gold=True)
    assert [x.text for x in todo] == ["Count beads"]
    got = [pm.answer(conn, t, "K2", x, fake({"Count beads": f"ACT-K2-COUNT{tag}"})) for x in todo]
    assert pm.score(got, gold) == {"lines": 1, "shortlist_recall": 1.0, "right": 1.0}


def test_the_linking_rule_model_is_allowed_and_another_word_is_not(world):
    conn, t, acts, ids, tag = world
    conn.execute("savepoint s")
    with pytest.raises(Exception, match="link_rule"):
        conn.execute(
            "update plan_entry set activity_id = %s, link_rule = 'guess', link_run = %s where id = %s",
            (acts["BOAT"], uuid.uuid4(), ids["boat"]),
        )
    conn.execute("rollback to savepoint s")


def test_a_line_answered_none_is_not_asked_again_and_a_refused_one_is(world):
    conn, t, acts, ids, tag = world
    lead = conn.execute("select staff_id from pii.staff limit 1").fetchone()["staff_id"]
    run = uuid.uuid4()
    (count,) = [x for x in pm.lines(conn, t, "K2") if x.key == "math"]
    pm.record(conn, t, run, pm.answer(conn, t, "K2", count, fake({})), lead, "plan_line_match v1")  # none
    (boat,) = [x for x in pm.lines(conn, t, "K2") if x.key == "art"]
    refused = pm.answer(conn, t, "K2", boat, fake({boat.text: "ACT-K2-NOT-LISTED"}))
    pm.record(conn, t, run, refused, lead, "plan_line_match v1")
    keys = {x.key for x in pm.lines(conn, t, "K2")}
    assert "math" not in keys and "art" in keys, keys
