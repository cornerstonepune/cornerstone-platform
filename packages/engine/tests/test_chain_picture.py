"""CP-54 A3: a child's picture rolls up the chain (Done when 8, 10, 11, 12). Each test writes its own rows inside its
transaction and rolls them back; placeholders only, no name."""

import datetime as dt
import json
import os
import uuid

import pytest

from engine.core import db, frameworks
from engine.w3_read import chain_picture
from tests.rows import a_child, a_read_paper, a_registry_skill, tenant

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")

WHEN = dt.datetime(2026, 11, 2, 5, 0, tzinfo=dt.UTC)


@pytest.fixture
def conn():
    with db.connect() as c:
        yield c
        c.rollback()


def _lo(conn, t, code, subject_code, kind="academic", band="G2"):
    conn.execute(
        "insert into learning_objective (tenant_id, code, band, subject, unit, title, signal, source, subject_code, kind)"
        " values (%s,%s,%s,'s','u','The child …','','school',%s,%s)",
        (t, code, band, subject_code, kind),
    )


def _link(conn, t, lo, framework, statement, relation, source="machine"):
    conn.execute(
        "insert into objective_statement (tenant_id, lo_code, framework_code, statement_code, relation, source)"
        " values (%s,%s,%s,%s,%s,%s)",
        (t, lo, framework, statement, relation, source),
    )


@pytest.fixture
def world(conn):
    """Two academic objectives and a character one, each with its place on the chain; one engine skill testing the first;
    one K2 activity naming the second (a project) and the character one."""
    t = tenant(conn)
    step = conn.execute(
        "select code from framework_statement where tenant_id = %s and framework_code = %s and kind = 'step' order by code limit 1",
        (t, frameworks.PROGRESSIONS),
    ).fetchone()["code"]
    for lo, sub in (("T3-LO-A", "NUM"), ("T3-LO-B", "ENG")):
        _lo(conn, t, lo, sub)
    _lo(conn, t, "T3-LO-C", None, "character", "K2")
    _link(conn, t, "T3-LO-A", frameworks.PROGRESSIONS, step, "on_step")
    _link(conn, t, "T3-LO-A", frameworks.PROFILE, "v2-deep-knowledge", "counts_toward")
    _link(conn, t, "T3-LO-A", frameworks.PROFILE, "capable", "evidence_for")
    _link(conn, t, "T3-LO-B", frameworks.PROFILE, "v2-communicating-together", "counts_toward", "person")
    _link(conn, t, "T3-LO-C", frameworks.PROFILE, "v2-self-and-others", "counts_toward")
    _link(conn, t, "T3-LO-C", frameworks.PROFILE, "kind", "evidence_for")
    skill = conn.execute(
        "select code from skill where tenant_id = %s order by code limit 1", (t,)
    ).fetchone()["code"]
    conn.execute(
        "update skill set lo_code = 'T3-LO-A', lo_source = 'machine' where tenant_id = %s and code = %s",
        (t, skill),
    )
    conn.execute(
        "insert into activity (tenant_id, code, band, strand, name, objective) values (%s,'T3-ACT','K2','Maths','a','o')",
        (t,),
    )
    for lo, src in (("T3-LO-B", "school"), ("T3-LO-C", "machine")):
        conn.execute(
            "insert into activity_objective (tenant_id, activity_code, lo_code, ord, source) values (%s,'T3-ACT',%s,1,%s)",
            (t, lo, src),
        )
    campus = conn.execute("select id from campus where tenant_id = %s limit 1", (t,)).fetchone()["id"]
    year = conn.execute(
        "select id from academic_year where tenant_id = %s order by starts_on desc limit 1", (t,)
    ).fetchone()["id"]
    klass = conn.execute(
        "insert into school_class (tenant_id, campus_id, academic_year_id, grade_code, section) values (%s,%s,%s,'K2',%s) returning id",
        (t, campus, year, f"T{uuid.uuid4().hex[:5]}"),
    ).fetchone()["id"]
    staff = conn.execute(
        "insert into staff (tenant_id, campus_id) values (%s,%s) returning id", (t, campus)
    ).fetchone()["id"]
    return {"t": t, "skill": skill, "registry": a_registry_skill(conn, t), "class": klass, "staff": staff}


def _written(conn, w, child, answers):
    """Confirmed written answers on the world's skill, one per entry: status, working_shown."""
    paper = a_read_paper(conn, [{"status": a["status"], "read": "1", "state": "confirmed"} for a in answers])
    for res, a in zip(paper["results"], answers, strict=True):
        conn.execute(
            "update item_result set working_shown = %s where id = %s", (a.get("working", "none"), res)
        )
        conn.execute(
            "update item set skill_set_code = %s where id = (select item_id from item_result where id = %s)",
            (w["skill"], res),
        )
        conn.execute(
            "insert into evidence_event (tenant_id, child_id, skill_code, rung_code, correct, channel, item_result_id,"
            " observed_at, confirmed_by) values (%s,%s,%s,'R24',%s,'item',%s,%s,'tester')",
            (w["t"], child, w["registry"], a["status"] == "correct", res, WHEN),
        )


def _seen(conn, w, child, outcome, supersedes=None):
    return conn.execute(
        "insert into activity_observation (tenant_id, confirmation_id, activity_code, child_id, class_id, outcome, entry_mode,"
        " route, expected_level, reached_level, observed_at, observed_by, confirmed_by, supersedes, reason)"
        " values (%s,%s,'T3-ACT',%s,%s,%s,'individual','form',2,2,%s,%s,%s,%s,%s) returning id",
        (
            w["t"],
            uuid.uuid4(),
            child,
            w["class"],
            outcome,
            WHEN,
            w["staff"],
            w["staff"],
            supersedes,
            supersedes and "misheard",
        ),
    ).fetchone()["id"]


def _picture(conn, w, child):
    return chain_picture.picture(conn, str(child))


def test_blank_wrong_and_wrong_with_working_stay_three_counts_at_every_level(conn, world):
    child = a_child(conn)
    answers = [{"status": "correct"}, {"status": "blank"}, {"status": "wrong"},
               {"status": "wrong", "working": "partial"}, {"status": "wrong", "working": "full"}]  # fmt: skip
    # the paper's own child is not ours: point its evidence at the child under test
    _written(conn, world, child, answers)
    p = _picture(conn, world, child)
    want = {"right": 1, "blank": 1, "wrong": 1, "wrong_with_working": 2}
    for level, key in (
        ("lo", "T3-LO-A"),
        ("subject", "NUM"),
        ("capability", "v2-deep-knowledge"),
        ("word", "capable"),
    ):
        got = p[level][key]["counts"]
        assert {k: got[k] for k in want} == want, level
        assert p[level][key]["n"] == 5


def test_an_activity_naming_three_objectives_sends_each_mark_to_its_own_and_the_picture_shows_every_capability(
    conn, world
):
    child = a_child(conn)
    _seen(conn, world, child, "as_expected")
    _seen(conn, world, child, "below")
    p = _picture(conn, world, child)
    assert p["lo"]["T3-LO-B"]["counts"]["met"] == 1 and p["lo"]["T3-LO-B"]["counts"]["below"] == 1
    assert p["lo"]["T3-LO-C"]["counts"]["met"] == 1
    assert {"v2-communicating-together", "v2-self-and-others"} <= set(p["capability"])
    assert p["word"]["kind"]["n"] == 2 and p["kinds"] == {"academic": 2, "character": 2}


def test_a_corrected_observation_counts_once_and_changes_no_evidence(conn, world):
    child = a_child(conn)
    first = _seen(conn, world, child, "below")
    before = conn.execute("select count(*) as n from activity_observation").fetchone()["n"]
    _seen(conn, world, child, "as_expected", supersedes=first)
    p = _picture(conn, world, child)
    assert p["lo"]["T3-LO-B"]["counts"]["met"] == 1 and p["lo"]["T3-LO-B"]["counts"]["below"] == 0
    assert (
        conn.execute("select count(*) as n from activity_observation").fetchone()["n"] == before + 1
    )  # appended, none edited


def test_the_picture_says_how_much_of_it_rests_on_links_the_machine_made(conn, world):
    child = a_child(conn)
    _written(
        conn, world, child, [{"status": "correct"}, {"status": "wrong"}]
    )  # on a machine link (skill -> LO-A)
    _seen(conn, world, child, "as_expected")  # LO-B: school link, person capability; LO-C: machine link
    p = _picture(conn, world, child)
    assert p["evidence"] == 4
    assert (
        p["lo"]["T3-LO-A"]["machine"] == 2
        and p["lo"]["T3-LO-B"]["machine"] == 0
        and p["lo"]["T3-LO-C"]["machine"] == 1
    )
    assert p["machine_share"] == 0.75
    # a person's check changes the link, and the picture follows on the next call: no evidence row is touched
    conn.execute(
        "update skill set lo_source = 'person' where tenant_id = %s and code = %s",
        (world["t"], world["skill"]),
    )
    p = _picture(conn, world, child)
    assert p["lo"]["T3-LO-A"]["machine"] == 0  # the evidence's own link is checked ...
    assert p["capability"]["v2-deep-knowledge"]["machine"] == 2  # ... the objective's capability link is not
    conn.execute("update objective_statement set source = 'person' where lo_code = 'T3-LO-A'")
    assert _picture(conn, world, child)["capability"]["v2-deep-knowledge"]["machine"] == 0


def test_a_second_call_gives_the_same_answer_and_a_skill_with_no_objective_is_counted_apart(conn, world):
    child = a_child(conn)
    _written(conn, world, child, [{"status": "correct"}, {"status": "blank"}])
    _seen(conn, world, child, "absent")
    conn.execute(
        "insert into evidence_event (tenant_id, child_id, skill_code, rung_code, correct, channel, observed_at, confirmed_by)"
        " values (%s,%s,%s,'R24',true,'teacher_override',%s,'tester')",
        (world["t"], child, world["registry"], WHEN),
    )
    a, b = _picture(conn, world, child), _picture(conn, world, child)
    assert json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)
    assert a["unplaced"] == 1 and a["lo"]["T3-LO-B"]["counts"]["not_shown"] == 1


def test_the_audit_counts_each_link_of_the_chain_n_of_n_and_names_what_is_short(conn, world):
    from engine.checks import chain_layers

    t = world["t"]
    _lo(conn, t, "T3-K2", "ENG", "academic", "K2")
    lines = chain_layers.below_n_of_n(conn)
    assert any(
        x.startswith("K2 objective → topic: ") and " of " in x for x in lines
    )  # the new objective has no topic
    layers = {x.name: x for x in chain_layers.layers(conn, t, "K2")}
    assert (
        layers["K2 objective → subject"].have == layers["K2 objective → subject"].of
    )  # every academic one has a subject
    assert layers["K2 objective → capability"].have < layers["K2 objective → capability"].of  # T3-K2 has none
    conn.execute("update learning_objective set topic_code = null where code = 'T3-K2'")


def test_engine_graph_picture_prints_counts_only(conn, world):
    child = a_child(conn)
    _seen(conn, world, child, "as_expected")
    text = "\n".join(chain_picture.lines(chain_picture.picture(conn, str(child))))
    assert "T3-LO-B" in text and "met=1" in text and "rest on a link the machine made" in text


def test_a_retired_objective_is_not_part_of_the_picture_or_the_audit(conn, world):
    from engine.checks import chain_layers

    child = a_child(conn)
    _seen(conn, world, child, "as_expected")
    conn.execute("update learning_objective set retired = true where code = 'T3-LO-B'")
    p = _picture(conn, world, child)
    assert "T3-LO-B" not in p["lo"] and "T3-LO-C" in p["lo"]
    before = chain_layers.layers(conn, world["t"], "G2")
    conn.execute("update learning_objective set retired = false where code = 'T3-LO-B'")
    after = chain_layers.layers(conn, world["t"], "G2")
    assert (
        next(x for x in after if x.name == "G2 objective → capability").of
        == 1 + next(x for x in before if x.name == "G2 objective → capability").of
    )


def test_an_objective_counting_toward_a_group_rolls_up_to_its_capability_and_to_the_groups_words(conn, world):
    t = world["t"]
    group = conn.execute(
        "select code, parent_code, items from framework_statement where tenant_id = %s and framework_code = %s"
        " and kind = 'group' and level_code is null order by code limit 1",
        (t, frameworks.PROFILE),
    ).fetchone()
    conn.execute("delete from objective_statement where lo_code = 'T3-LO-B' and relation = 'counts_toward'")
    conn.execute(
        "insert into objective_statement (tenant_id, lo_code, framework_framework_code, statement_code, relation, source)"
        " values (%s, 'T3-LO-B', %s, %s, 'counts_toward', 'machine')".replace(
            "framework_framework_code", "framework_code"
        ),
        (t, frameworks.PROFILE, group["code"]),
    )
    child = a_child(conn)
    _seen(conn, world, child, "as_expected")
    p = _picture(conn, world, child)
    assert group["parent_code"] in p["capability"]  # the capability, not the group
    assert set(group["items"]) <= set(p["word"])
