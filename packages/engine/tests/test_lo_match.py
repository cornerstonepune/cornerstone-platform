"""CP-51: an objective no activity ties to one skill, linked by a model to one shortlisted skill, or none
(`w1_bank/lo_match.py`). Placeholder objectives and skills of a placeholder tenant row set, a fake model, a rolled-back
transaction: no school data."""

import json
import os
import uuid

import pytest

from engine.core import db
from engine.w1_bank import lo_match as lm
from engine.w1_bank import map_ledger
from tests.voice_rows import a_k2_class

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")


@pytest.fixture
def conn():
    with db.connect() as c:
        yield c
        c.rollback()


@pytest.fixture
def world(conn):
    t = conn.execute("select id from tenant where slug = %s", (db.tenant_slug(),)).fetchone()["id"]
    tag = uuid.uuid4().hex[:6].upper()
    band = f"Z{tag[:3]}"
    conn.execute("update config set value = '2'::jsonb where key = 'lo.shortlist_size'")
    conn.execute(
        "insert into grade (tenant_id, code, name, ord) values (%s, %s, 'Placeholder grade', 900)", (t, band)
    )
    for code, name in [
        ("CNT", "Counts objects to ten"),
        ("SHP", "Names flat shapes"),
        ("SNG", "Sings a song in rhythm"),
        ("PAT", "Repeats a colour pattern"),
    ]:
        conn.execute(
            "insert into registry_skill (tenant_id, code, domain, strand, name) values (%s, %s, 'T', 'T.X', %s)",
            (t, f"T{tag}.{code}", name),
        )

    def lo(code, subject, unit, title):
        conn.execute(
            "insert into learning_objective (tenant_id, code, band, subject, unit, title, signal)"
            " values (%s, %s, %s, %s, %s, %s, 'Foundational')",
            (t, f"LO-{tag}-{code}", band, subject, unit, title),
        )
        return f"LO-{tag}-{code}"

    los = {
        "count": lo("1", "Maths", "Number", "Count objects up to ten"),
        "sib": lo("2", "Maths", "Number", "Count beads"),
        "shape": lo("3", "Maths", "Shapes", "Name a circle and a square"),
        "shape2": lo("6", "Maths", "Shapes", "Draw a circle"),
        "song": lo("4", "Music", "Songs", "Sing along"),
        "lone": lo("5", "Science", "Plants", "Name parts of a plant"),
    }
    sk = lambda c: f"T{tag}.{c}"  # noqa: E731
    for o, s, source in [("sib", "CNT", "school"), ("sib", "PAT", "school"), ("shape", "SHP", "school"), ("shape2", "SHP", "school"),
                         ("song", "SNG", "school")]:  # fmt: skip
        conn.execute(
            "insert into learning_objective_skill (tenant_id, lo_code, skill_code, source) values (%s,%s,%s,%s)",
            (t, los[o], sk(s), source),
        )
    return conn, t, band, los, sk


def fake(choice: dict[str, str]):
    calls = []

    def ask(variables, about):
        calls.append(variables)
        return {"skill_code": choice.get(about, ""), "confidence": 0.8, "reason": "the words"}

    ask.calls = calls  # type: ignore[attr-defined]
    return ask


def test_only_objectives_with_no_skill_are_asked_and_the_shortlist_is_their_unit_and_subject_words_first(
    world,
):
    conn, t, band, los, sk = world
    open_ = {o.code for o in lm.objectives(conn, t, band)}
    assert open_ == {los["count"], los["lone"]}
    (count,) = [o for o in lm.objectives(conn, t, band) if o.code == los["count"]]
    # its unit's skills (count, pattern) come before the subject's (shape); the size is the config row's 2
    assert [s["code"] for s in lm.shortlist(conn, t, band, count)] == [sk("CNT"), sk("PAT")]


def test_an_objective_with_nothing_near_it_waits_for_a_person_with_no_call(world):
    conn, t, band, los, sk = world
    (lone,) = [o for o in lm.objectives(conn, t, band) if o.code == los["lone"]]
    ask = fake({})
    a = lm.answer(conn, t, band, lone, ask)
    assert a.skill is None and not ask.calls and "no skill" in a.reason


def test_a_chosen_skill_is_a_proposal_the_ledger_applies_as_the_machines_and_can_revert(world):
    conn, t, band, los, sk = world
    staff = a_k2_class(conn)["staff"]
    (count,) = [o for o in lm.objectives(conn, t, band) if o.code == los["count"]]
    a = lm.answer(conn, t, band, count, fake({count.code: sk("CNT")}))
    run = uuid.uuid4()
    lm.record(conn, t, run, a, staff, "lo_skill_match v1")
    p = conn.execute(
        "select id, kind, status, proposal from curriculum_proposal where run_id = %s", (run,)
    ).fetchone()
    assert (p["kind"], p["status"], p["proposal"]["skills"]) == ("lo_skill", "auto_passed", [sk("CNT")])
    map_ledger.apply(conn, t, staff, True, only=p["id"], kind="lo_skill")
    link = conn.execute(
        "select skill_code, source, proposal_id from learning_objective_skill where tenant_id = %s and lo_code = %s",
        (t, count.code),
    ).fetchone()
    assert (link["skill_code"], link["source"], link["proposal_id"]) == (sk("CNT"), "machine", p["id"])
    assert {o.code for o in lm.objectives(conn, t, band)} == {los["lone"]}, (
        "a linked objective is not asked again"
    )
    map_ledger.revert(conn, t, p["id"], staff, "test")
    assert not conn.execute(
        "select 1 from learning_objective_skill where tenant_id = %s and lo_code = %s", (t, count.code)
    ).fetchone()


def test_a_skill_off_the_shortlist_is_refused_and_none_waits_for_a_person_and_neither_is_asked_twice(world):
    conn, t, band, los, sk = world
    staff = a_k2_class(conn)["staff"]
    (count,) = [o for o in lm.objectives(conn, t, band) if o.code == los["count"]]
    bad = lm.answer(conn, t, band, count, fake({count.code: sk("SNG")}))
    assert bad.skill is None and bad.problems == [
        f"{sk('SNG')} is not on the shortlist this objective was given"
    ]
    none = lm.answer(conn, t, band, count, fake({}))
    run = uuid.uuid4()
    for a in (bad, none):
        lm.record(conn, t, run, a, staff, "lo_skill_match v1")
    rows = conn.execute(
        "select status, proposal from curriculum_proposal where run_id = %s order by status", (run,)
    ).fetchall()
    assert [(r["status"], r["proposal"]["skills"]) for r in rows] == [("needs_person", []), ("rejected", [])]
    planned = map_ledger.apply(conn, t, staff, False, kind="lo_skill", fill=True)
    assert all(count.code not in line for line in planned), "a none or a refusal is never written as a link"
    assert count.code not in {o.code for o in lm.objectives(conn, t, band)}, (
        "an answered objective is not asked again"
    )
    # the ledger's own history reads a none without falling over (the next `curriculum propose` reads it)
    assert ("lo_skill", count.code, "") in map_ledger.proposed(conn, t)


def test_the_gold_is_the_schools_single_links_and_the_score_counts_shortlist_and_choice(world):
    conn, t, band, los, sk = world
    gold = lm.gold_links(conn, t, band)
    # "sib" has two links: not a gold row
    assert gold == {los["shape"]: sk("SHP"), los["shape2"]: sk("SHP"), los["song"]: sk("SNG")}
    objs = lm.objectives(conn, t, band, gold=True)
    assert {o.code for o in objs} == set(gold)
    # an objective's own link never reaches its shortlist: shape finds SHP only through shape2, song finds nothing
    answers = [lm.answer(conn, t, band, o, fake({los["shape"]: sk("SHP")})) for o in objs]
    s = lm.score(answers, gold)
    assert (s["objectives"], round(s["shortlist_recall"], 2), round(s["right"], 2)) == (3, 0.67, 0.33)


def test_the_prompt_is_a_row_with_a_closed_schema(conn):
    row = conn.execute(
        "select text, json_schema from prompt where purpose = %s and version = 1", (lm.PURPOSE,)
    ).fetchone()
    assert row is not None and "{{candidates}}" in row["text"] and "{{objective}}" in row["text"]
    assert json.loads(json.dumps(row["json_schema"]))["required"] == ["skill_code", "confidence", "reason"]
