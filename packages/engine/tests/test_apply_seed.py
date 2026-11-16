"""CP-54: the curriculum data files are checked by code and applied as the machine's, never over a person's.

Each test writes its own files into a temporary seed folder and rolls back; nothing here reads the real files."""

import json
import os
import uuid

import pytest

from engine.core import db
from engine.w1_bank import apply_seed, cli_seed, seed_rows
from tests.rows import tenant

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")
LO = "LO-G1-0014"
GOOD = "The child makes an amount in rupees from coins, using five-rupee and ten-rupee coins."
LEVELS = {
    "0": "Not yet shown with coins.",
    "1": "Counts coins with an educator's help.",
    "2": "Makes the amount from coins.",
    "3": "Makes the same amount in two ways.",
}


@pytest.fixture
def world(tmp_path, monkeypatch):
    monkeypatch.setattr(seed_rows, "ROOT", tmp_path)
    with db.connect() as conn:
        yield conn, tenant(conn), tmp_path
        conn.rollback()


def put(root, name, data):
    path = root / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data))


def lo(conn, t, code=LO):
    return conn.execute(
        "select title, source_text, source, retired, signal from learning_objective where tenant_id=%s and code=%s",
        (t, code),
    ).fetchone()


def rewrite(title=GOOD, **kw):
    return {
        "lo_code": LO,
        "action": "rewrite",
        "new_title": title,
        "signal": "Application",
        "sources": [f"lo:{LO}"],
        "confidence": "low",
        **kw,
    }


def test_a_rewrite_that_passes_the_rules_is_applied_as_the_machines_and_keeps_the_original(world):
    conn, t, root = world
    before = lo(conn, t)["title"]
    put(root, "lo_rewrites/G1.json", {"band": "G1", "rows": [rewrite()]})
    rep, run = apply_seed.apply(conn, t)
    got = lo(conn, t)
    assert (got["title"], got["source_text"], got["source"]) == (GOOD, before, "machine")
    assert rep.counts() == {"lo_title": 1} and run


def test_a_second_apply_changes_nothing_and_a_low_confidence_row_is_not_refused(world):
    conn, t, root = world
    put(root, "lo_rewrites/G1.json", {"band": "G1", "rows": [rewrite(confidence="low")]})
    apply_seed.apply(conn, t)
    rep, run = apply_seed.apply(conn, t)
    assert rep.changes == [] and run is None and rep.rejected == []


def test_a_rewrite_that_breaks_a_rule_is_listed_and_never_applied(world):
    conn, t, root = world
    before = lo(conn, t)["title"]
    put(
        root,
        "lo_rewrites/G1.json",
        {"band": "G1", "rows": [rewrite("The child understands money."), rewrite("Counting coins.")]},
    )
    rep, _ = apply_seed.apply(conn, t)
    assert len(rep.rejected) == 2 and rep.changes == []
    assert lo(conn, t)["title"] == before


def test_a_row_citing_a_source_that_does_not_exist_is_refused(world):
    conn, t, root = world
    put(
        root,
        "lo_rewrites/G1.json",
        {"band": "G1", "rows": [rewrite(sources=[f"lo:{LO}", "NCERT-LO-2017:no.such.row"])]},
    )
    rep, _ = apply_seed.apply(conn, t)
    assert "does not exist" in rep.rejected[0][2][0]


def test_an_objective_a_person_edited_is_never_overwritten(world):
    conn, t, root = world
    conn.execute(
        "update learning_objective set source = 'person', title = 'Their own words' where tenant_id=%s and code=%s",
        (t, LO),
    )
    put(root, "lo_rewrites/G1.json", {"band": "G1", "rows": [rewrite()]})
    rep, _ = apply_seed.apply(conn, t)
    assert lo(conn, t)["title"] == "Their own words" and rep.skipped


def test_folding_into_the_unit_retires_the_objective_and_deletes_nothing(world):
    conn, t, root = world
    put(
        root,
        "lo_rewrites/G1.json",
        {"band": "G1", "rows": [{"lo_code": LO, "action": "fold_into_unit", "confidence": "high"}]},
    )
    apply_seed.apply(conn, t)
    assert lo(conn, t)["retired"] is True


def test_a_run_can_be_put_back(world):
    conn, t, root = world
    before = lo(conn, t)
    put(root, "lo_rewrites/G1.json", {"band": "G1", "rows": [rewrite()]})
    _, run = apply_seed.apply(conn, t)
    assert apply_seed.revert(conn, t, run) == {"lo_title": 1}
    assert lo(conn, t)["title"] == before["title"] and lo(conn, t)["source"] == before["source"]


def activity(**kw):
    return {"ref": "G1-001", "name": "Coin shop", "subject_code": "NUM", "unit": "Money", "format": "game",
            "steps": ["Set up the shop.", "Children pay with coins."], "materials": "coins", "lo_codes": [LO], "levels": LEVELS,
            "source": {"sheet": "abc", "tab": "Monthly Detailed Plan", "cell": "C14"}, "confidence": "medium", **kw}  # fmt: skip


def test_an_activity_with_four_levels_a_link_and_its_cell_is_added_as_the_machines(world):
    conn, t, root = world
    put(root, "activities/G1.json", {"grade": "G1", "rows": [activity()]})
    apply_seed.apply(conn, t, formats=["game", "practice"])
    row = conn.execute(
        "select band, subject_code, level_3, source_row, source_file from activity where tenant_id=%s and code='ACT-G1-001'",
        (t,),
    ).fetchone()
    assert (
        row["band"] == "G1"
        and row["level_3"] == LEVELS["3"]
        and row["source_row"] == "C14"
        and "machine" in row["source_file"]
    )
    link = conn.execute(
        "select source from activity_objective where tenant_id=%s and activity_code='ACT-G1-001'", (t,)
    ).fetchone()
    assert link["source"] == "machine"


@pytest.mark.parametrize(
    "bad",
    [
        {"levels": {"0": "a", "1": "b", "2": "c"}},
        {"lo_codes": []},
        {"source": {"sheet": "abc"}},
        {"format": "lecture"},
        {"steps": []},
    ],
)
def test_an_activity_missing_a_level_a_link_a_cell_or_a_known_format_is_refused(world, bad):
    conn, t, root = world
    put(root, "activities/G1.json", {"grade": "G1", "rows": [activity(**bad)]})
    rep, _ = apply_seed.apply(conn, t, formats=["game"])
    assert rep.rejected and rep.changes == []


def test_an_activity_the_database_already_has_is_not_overwritten(world):
    conn, t, root = world
    put(root, "activities/G1.json", {"grade": "G1", "rows": [activity()]})
    apply_seed.apply(conn, t, formats=["game"])
    conn.execute(
        "update activity set name = 'Edited by an educator' where tenant_id=%s and code='ACT-G1-001'", (t,)
    )
    apply_seed.apply(conn, t, formats=["game"])
    assert (
        conn.execute("select name from activity where tenant_id=%s and code='ACT-G1-001'", (t,)).fetchone()[
            "name"
        ]
        == "Edited by an educator"
    )


def test_an_activity_may_name_an_objective_the_file_creates(world):
    conn, t, root = world
    new = {
        "ref": "n1",
        "title": "The child sorts coins by size.",
        "subject_code": "NUM",
        "unit": "Money",
        "signal": "Procedural",
        "confidence": "low",
    }
    put(
        root, "activities/G1.json", {"grade": "G1", "new_los": [new], "rows": [activity(lo_codes=["new:n1"])]}
    )
    apply_seed.apply(conn, t, formats=["game"])
    made = lo(conn, t, "LO-G1-N001")
    assert made["source"] == "machine" and made["title"] == new["title"]
    assert (
        conn.execute(
            "select lo_code from activity_objective where tenant_id=%s and activity_code='ACT-G1-001'", (t,)
        ).fetchone()["lo_code"]
        == "LO-G1-N001"
    )


def group(conn, t):
    return conn.execute(
        "select code from framework_statement where tenant_id=%s and framework_code='CS-PROFILE' and kind='group' and level_code is null order by code",
        (t,),
    ).fetchall()


def test_an_objective_gets_exactly_one_capability_group_and_a_group_off_the_profile_is_refused(world):
    conn, t, root = world
    g = [r["code"] for r in group(conn, t)]
    put(
        root,
        "capability_choices.json",
        {"rows": [{"lo_code": LO, "group": g[0], "confidence": "low"}, {"lo_code": LO, "group": "nonsense"}]},
    )
    rep, _ = apply_seed.apply(conn, t)
    assert len(rep.rejected) == 1
    put(root, "capability_choices.json", {"rows": [{"lo_code": LO, "group": g[1], "confidence": "high"}]})
    apply_seed.apply(conn, t)
    have = conn.execute(
        "select statement_code from objective_statement where tenant_id=%s and lo_code=%s and framework_code='CS-PROFILE' and relation='counts_toward'",
        (t, LO),
    ).fetchall()
    assert [h["statement_code"] for h in have] == [g[1]]


def test_a_capability_a_person_set_is_not_replaced(world):
    conn, t, root = world
    g = [r["code"] for r in group(conn, t)]
    conn.execute(
        "delete from objective_statement where tenant_id=%s and lo_code=%s and framework_code='CS-PROFILE'",
        (t, LO),
    )
    conn.execute(
        "insert into objective_statement (tenant_id, lo_code, framework_code, statement_code, relation, source) values (%s,%s,'CS-PROFILE',%s,'counts_toward','person')",
        (t, LO, g[0]),
    )
    put(root, "capability_choices.json", {"rows": [{"lo_code": LO, "group": g[1]}]})
    apply_seed.apply(conn, t)
    assert (
        conn.execute(
            "select statement_code from objective_statement where tenant_id=%s and lo_code=%s and framework_code='CS-PROFILE'",
            (t, LO),
        ).fetchone()["statement_code"]
        == g[0]
    )


def test_an_engine_skill_names_one_objective_of_its_own_grade(world):
    conn, t, root = world
    conn.execute("update skill set lo_code = null where tenant_id=%s", (t,))
    other = conn.execute(
        "select code from learning_objective where tenant_id=%s and band='G2' limit 1", (t,)
    ).fetchone()["code"]
    put(
        root,
        "engine_skill_lo.json",
        {"rows": [{"skill_code": "ADD.1D1D", "lo_code": other}, {"skill_code": "SUB.1D1D", "lo_code": LO}]},
    )
    rep, _ = apply_seed.apply(conn, t)
    assert len(rep.rejected) == 1
    assert (
        conn.execute("select lo_code from skill where tenant_id=%s and code='SUB.1D1D'", (t,)).fetchone()[
            "lo_code"
        ]
        == LO
    )


def test_a_unit_folds_into_a_topic_of_its_own_subject(world):
    conn, t, root = world
    conn.execute("update learning_objective set topic_code = null where tenant_id=%s and code=%s", (t, LO))
    put(
        root,
        "unit_topics.json",
        {
            "rows": [
                {"subject_code": "NUM", "unit": "Money", "new_topic": {"code": "NUM.MONEY", "name": "Money"}},
                {"subject_code": "ENG", "unit": "Money", "topic_code": "ADDSUB"},
            ]
        },
    )
    rep, _ = apply_seed.apply(conn, t)
    assert (
        conn.execute(
            "select topic_code from learning_objective where tenant_id=%s and code=%s", (t, LO)
        ).fetchone()["topic_code"]
        == "NUM.MONEY"
    )
    assert len(rep.rejected) == 1  # ADDSUB is a topic of NUM, not ENG


def test_the_second_reader_sample_is_fixed_and_takes_the_low_confidence_rows_more_often():
    rows = [{"lo_code": f"LO-G1-{i:04d}", "confidence": "low" if i % 2 else "high"} for i in range(4000)]
    a, b = cli_seed.sample(rows, 0.05, 4.0), cli_seed.sample(rows, 0.05, 4.0)
    assert a == b
    low = sum(r["confidence"] == "low" for r in a)
    assert low > len(a) - low and 0.04 < len(a) / len(rows) < 0.20
