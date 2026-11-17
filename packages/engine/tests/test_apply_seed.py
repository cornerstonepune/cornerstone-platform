"""CP-54: the curriculum data files are checked by code and applied as the machine's, never over a person's.

Each test writes its own files into a temporary seed folder and rolls back; nothing here reads the real files."""

import json
import os
import uuid

import pytest

from engine.core import db
from engine.w1_bank import apply_seed, cli_seed, seed_rows
from tests.rows import a_person, asking_as, tenant

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


def ledger(root, grade, **refs):
    """The code ledger the seed carries: {ref: code} for one band (a new objective's code is never its place in a file)."""
    path = root / "new_lo_codes.json"
    have = json.loads(path.read_text()) if path.exists() else {"codes": {}, "highest": {}}
    have["codes"].setdefault(grade, {}).update(refs)
    have["highest"][grade] = max([int(c.rsplit("N", 1)[1]) for c in have["codes"][grade].values()])
    path.write_text(json.dumps(have))


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
            "steps": ["Set up the shop.", "Children pay with coins.", "Check the change together."], "materials": "coins", "lo_codes": [LO], "levels": LEVELS,
            "source": {"sheet": "abc", "tab": "Monthly Detailed Plan", "cell": "C14"}, "confidence": "medium", **kw}  # fmt: skip


def test_an_activity_with_four_levels_a_link_and_its_cell_is_added_as_the_machines(world):
    conn, t, root = world
    put(root, "activities/G1.json", {"grade": "G1", "rows": [activity()]})
    apply_seed.apply(conn, t, teaching_formats=["game", "practice"])
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
    rep, _ = apply_seed.apply(conn, t, teaching_formats=["game"])
    assert rep.rejected and rep.changes == []


def test_an_activity_a_person_has_edited_is_not_overwritten(world):
    conn, t, root = world
    put(root, "activities/G1.json", {"grade": "G1", "rows": [activity()]})
    apply_seed.apply(conn, t, teaching_formats=["game"])
    person = a_person(conn, f"edit-{uuid.uuid4().hex[:6]}@school.invalid")
    asking_as(conn, person)  # the website's signed-in member of staff: the history keeps who
    conn.execute(
        "update activity set name = 'Edited by an educator' where tenant_id=%s and code='ACT-G1-001'", (t,)
    )
    put(root, "activities/G1.json", {"grade": "G1", "rows": [activity(name="The seed's newer name")]})
    apply_seed.apply(conn, t, teaching_formats=["game"])
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
    ledger(root, "G1", n1="LO-G1-N001")
    put(
        root, "activities/G1.json", {"grade": "G1", "new_los": [new], "rows": [activity(lo_codes=["new:n1"])]}
    )
    apply_seed.apply(conn, t, teaching_formats=["game"])
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


def test_a_run_keeps_how_sure_each_capability_was_and_why_so_a_code_default_can_be_found(world):
    conn, t, _ = world
    g = [r["code"] for r in group(conn, t)]
    conn.execute(
        "delete from objective_statement where tenant_id=%s and lo_code=%s and framework_code='CS-PROFILE'",
        (t, LO),
    )
    row = {"lo_code": LO, "group": g[0], "confidence": "low", "reason": "the subject default"}
    _, run = apply_seed.apply_rows(conn, t, "capability", [row])
    kept = conn.execute("select result from flow_run where id = %s", (run,)).fetchone()["result"]["changes"]
    assert [(c["lo"], c["after"], c["confidence"], c["reason"]) for c in kept] == [
        (LO, g[0], "low", "the subject default")
    ]
    link = conn.execute(
        "select source from objective_statement where tenant_id=%s and lo_code=%s and framework_code='CS-PROFILE'",
        (t, LO),
    ).fetchone()
    assert link["source"] == "machine"  # never a value that reads as person-set


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


def test_the_completeness_audit_is_silent_where_the_machine_has_not_worked_and_names_every_gap_where_it_has(
    world,
):
    from engine.checks import complete

    conn, t, root = world
    assert complete.every_objective_and_activity_in_scope_is_complete(conn) == []
    conn.execute(
        "update learning_objective set source = 'machine' where tenant_id = %s and code = %s", (t, LO)
    )
    gaps = "\n".join(complete.every_objective_and_activity_in_scope_is_complete(conn))
    assert (
        "no capability group" in gaps and "LO-G1-" in gaps
    )  # the band G1 is now in scope; its objectives lack a group


def test_a_level_that_starts_the_child_is_refused_and_so_is_a_cell_free_source(world):
    conn, t, root = world
    bad = dict(LEVELS, **{"1": "The child counts with help."})
    put(
        root,
        "activities/G1.json",
        {
            "grade": "G1",
            "rows": [activity(levels=bad), activity(ref="G1-002", source={"sheet": "abc", "tab": "Plan"})],
        },
    )
    rep, _ = apply_seed.apply(conn, t, teaching_formats=["game"])
    why = " ".join(w for _, _, f in rep.rejected for w in f)
    assert "rule a" in why and "rule f" in why and rep.changes == []


def test_a_level_opening_shared_by_more_than_three_activities_of_a_band_is_refused_from_the_fourth(world):
    conn, t, root = world
    rows = [
        activity(
            ref=f"G1-00{i}",
            levels=dict(LEVELS, **{"1": f"Counts the coins with an educator's help, case {i}."}),
        )
        for i in range(1, 6)
    ]
    put(root, "activities/G1.json", {"grade": "G1", "rows": rows})
    rep, _ = apply_seed.apply(conn, t, teaching_formats=["game"])
    assert (
        len(rep.changes) == 3 and len(rep.rejected) == 2 and all("rule b" in f[0] for _, _, f in rep.rejected)
    )


def test_a_keep_that_does_not_start_the_child_is_refused_and_two_joined_actions_only_warn(world):
    conn, t, root = world
    put(root, "lo_rewrites/G1.json", {"band": "G1", "rows": [
        {"lo_code": LO, "action": "keep", "confidence": "high"},
        {"lo_code": "LO-G1-0015", "action": "rewrite", "new_title": "The child reads and writes the amounts on price tags from 1 to 20.", "sources": ["lo:LO-G1-0015"], "confidence": "medium"},
    ]})  # fmt: skip
    rep, _ = apply_seed.apply(conn, t)
    assert any("rule d" in w for _, _, f in rep.rejected for w in f)
    assert rep.warnings and "rule e" in rep.warnings[0][2]


def test_a_character_activity_has_three_look_fors_and_no_levels_and_keeps_its_basis(world):
    conn, t, root = world
    look = [
        "Passes a tool to a partner without being asked.",
        "Waits for a turn at the table.",
        "Says thank you when a partner shares.",
    ]
    put(
        root,
        "activities/G1.json",
        {"grade": "G1", "rows": [activity(levels=None, look_fors=look, basis="educator_plan")]},
    )
    apply_seed.apply(conn, t, teaching_formats=["game"])
    row = conn.execute(
        "select level_2, thinking_doc from activity where tenant_id=%s and code='ACT-G1-001'", (t,)
    ).fetchone()
    assert row["level_2"] == "" and row["thinking_doc"] == {"look_fors": look, "basis": "educator_plan"}


@pytest.mark.parametrize(
    "look",
    [
        ["a", "b"],
        ["Feels proud of the shop.", "b b", "c c"],
        ["Tells me she is sure.", "x y", "z w"],
        ["Passes the tool, then Aqsa waits.", "b b", "c c"],
    ],
)
def test_look_fors_are_three_things_seen_not_a_feeling_a_told_me_or_a_name(world, look):
    conn, t, root = world
    put(root, "activities/G1.json", {"grade": "G1", "rows": [activity(levels=None, look_fors=look)]})
    rep, _ = apply_seed.apply(conn, t, teaching_formats=["game"])
    assert rep.rejected and rep.changes == []


def test_levels_and_look_fors_together_or_neither_are_refused(world):
    conn, t, root = world
    look = ["Passes a tool.", "Waits a turn.", "Says thank you."]
    put(
        root,
        "activities/G1.json",
        {"grade": "G1", "rows": [activity(look_fors=look), activity(ref="G1-002", levels=None)]},
    )
    rep, _ = apply_seed.apply(conn, t, teaching_formats=["game"])
    assert len(rep.rejected) == 2


def test_an_objective_created_by_either_file_gets_the_bands_next_code_and_one_ref_is_one_objective(world):
    conn, t, root = world
    a = {
        "ref": "G1-NEW-001",
        "title": "The child sorts coins by size.",
        "subject_code": "NUM",
        "unit": "Money",
        "signal": "Procedural",
        "confidence": "low",
    }
    b = {
        "ref": "G1-NEW-002",
        "title": "The child names the coin shown.",
        "subject_code": "NUM",
        "unit": "Money",
        "signal": "Foundational",
        "confidence": "low",
    }
    ledger(root, "G1", **{"G1-NEW-001": "LO-G1-N001", "G1-NEW-002": "LO-G1-N002"})
    put(root, "lo_rewrites/G1.json", {"band": "G1", "rows": [], "new_los": [a]})
    put(
        root,
        "activities/G1.json",
        {"grade": "G1", "new_los": [a, b], "rows": [activity(lo_codes=["G1-NEW-001", "G1-NEW-002"])]},
    )
    apply_seed.apply(conn, t, teaching_formats=["game"])
    assert (
        lo(conn, t, "LO-G1-N001")["title"] == a["title"] and lo(conn, t, "LO-G1-N002")["title"] == b["title"]
    )
    assert (
        conn.execute(
            "select count(*) n from activity_objective where tenant_id=%s and activity_code='ACT-G1-001'",
            (t,),
        ).fetchone()["n"]
        == 2
    )


def test_the_rejects_file_counts_the_refusals_per_band_and_rule(world):
    conn, t, root = world
    put(
        root,
        "activities/G1.json",
        {
            "grade": "G1",
            "rows": [activity(levels=dict(LEVELS, **{"2": "The child makes it."}), steps=["one"])],
        },
    )
    rep, _ = apply_seed.apply(conn, t, teaching_formats=["game"])
    got = cli_seed.rejected_report(rep)["counts_by_band_and_rule"]["G1"]
    assert got["a"] == 1 and got["c"] == 1


def test_a_reviewers_file_is_kept_beside_the_data(world, tmp_path):
    f = tmp_path / "r.json"
    f.write_text(json.dumps({"rows": [{"kind": "lo", "band": "G1", "key": LO, "verdict": "fix", "correction": "The child counts coins.", "why": "x"},
                                      {"kind": "activity", "band": "G2", "key": "G2-001", "verdict": "wrong", "why": "y"}]}))  # fmt: skip
    from typer.testing import CliRunner

    from engine.cli import app

    world[2].joinpath("review").mkdir(exist_ok=True)
    out = CliRunner().invoke(app, ["curriculum", "review-record", str(f)])
    assert out.exit_code == 0 and "{'ok': 0, 'fix': 1, 'wrong': 1}" in out.output


def test_the_two_halves_load_apart_each_as_a_run_of_its_own_and_one_can_be_put_back(world):
    conn, t, root = world
    put(root, "lo_rewrites/G1.json", {"band": "G1", "rows": [rewrite()]})
    put(root, "activities/G1.json", {"grade": "G1", "rows": [activity()]})
    title_before = lo(conn, t)["title"]

    objectives, run_o = apply_seed.apply(conn, t, teaching_formats=["game", "practice"], part="objectives")
    assert lo(conn, t)["title"] == GOOD and objectives.counts().get("activity") is None
    assert (
        conn.execute("select 1 from activity where tenant_id=%s and code='ACT-G1-001'", (t,)).fetchone()
        is None
    )

    activities, run_a = apply_seed.apply(conn, t, teaching_formats=["game", "practice"], part="activities")
    assert activities.counts().get("activity") == 1 and activities.counts().get("lo_title") is None
    assert run_o and run_a and run_o != run_a  # two records, one for each half

    apply_seed.revert(conn, t, run_a)  # put back the activities only
    assert (
        conn.execute("select 1 from activity where tenant_id=%s and code='ACT-G1-001'", (t,)).fetchone()
        is None
    )
    assert lo(conn, t)["title"] == GOOD
    apply_seed.revert(conn, t, run_o)
    assert lo(conn, t)["title"] == title_before


def test_a_part_that_is_not_one_of_the_halves_is_refused(world):
    conn, t, _ = world
    with pytest.raises(ValueError):
        apply_seed.apply(conn, t, part="everything")


def test_a_deploy_applies_the_halves_the_setting_names_and_holds_the_rest_back(world, monkeypatch):
    conn, t, root = world
    conn.execute(
        "update config set value = '[\"objectives\"]' where tenant_id = %s and key = 'curriculum.seed_parts'",
        (t,),
    )
    seen = []
    monkeypatch.setattr(
        cli_seed, "run_apply", lambda write, part="all": seen.append(part) or apply_seed.Report()
    )
    monkeypatch.setattr(cli_seed.db, "connect", lambda: _Same(conn))
    cli_seed.apply_on_load()
    assert seen == ["objectives"]


class _Same:
    """The test's own connection, handed to code that opens and closes one: closing it here leaves it open."""

    def __init__(self, conn):
        self.conn = conn

    def __enter__(self):
        return self.conn

    def __exit__(self, *a):
        return False


def test_an_activity_with_no_objective_left_is_applied_unlinked_when_it_says_it_needs_a_link(world):
    conn, t, root = world
    row = activity(lo_codes=[], needs_link=True)
    put(root, "activities/G1.json", {"grade": "G1", "rows": [row]})
    rep, _ = apply_seed.apply(conn, t, teaching_formats=["game", "practice"])
    assert rep.rejected == [] and rep.counts().get("activity") == 1
    assert (
        conn.execute(
            "select count(*) as n from activity_objective where activity_code = 'ACT-G1-001'"
        ).fetchone()["n"]
        == 0
    )
    bare = activity(lo_codes=[])
    put(root, "activities/G1.json", {"grade": "G1", "rows": [bare]})
    rep2, _ = apply_seed.apply(conn, t, teaching_formats=["game", "practice"])
    assert any(
        "one to three learning objectives" in w for _, _, why in rep2.rejected for w in why
    )  # unflagged: still refused


def test_a_later_seed_brings_a_machine_made_activity_up_to_what_the_file_now_says_and_revert_puts_it_back(
    world,
):
    conn, t, root = world
    put(root, "activities/G1.json", {"grade": "G1", "rows": [activity()]})
    apply_seed.apply(conn, t, teaching_formats=["game"])
    better = activity(name="Coin shop, second go", steps=["Set up.", "Pay with coins.", "Check the change.", "Swap roles."],
                      levels={**LEVELS, "1": "Counts coins when asked, with an educator beside them."})  # fmt: skip
    put(root, "activities/G1.json", {"grade": "G1", "rows": [better]})
    rep, run = apply_seed.apply(conn, t, teaching_formats=["game"])
    assert rep.counts() == {"activity_updated": 1}
    row = conn.execute(
        "select name, level_1, steps_list, source_file from activity where code='ACT-G1-001'"
    ).fetchone()
    assert (
        row["name"] == "Coin shop, second go"
        and len(row["steps_list"]) == 4
        and "machine" in row["source_file"]
    )
    again, _ = apply_seed.apply(conn, t, teaching_formats=["game"])
    assert (
        again.changes == [] and again.skipped.get("already as the file says") == 1
    )  # a third run moves nothing
    apply_seed.revert(conn, t, run)
    back = conn.execute("select name, level_1 from activity where code='ACT-G1-001'").fetchone()
    assert back["name"] == "Coin shop" and back["level_1"] == LEVELS["1"]


def test_a_later_seed_rewords_a_machine_made_new_objective_but_not_one_a_person_took_over(world):
    conn, t, root = world

    def new(title):
        return {
            "ref": "n1",
            "title": title,
            "subject_code": "NUM",
            "unit": "Money",
            "signal": "Procedural",
            "confidence": "low",
        }

    ledger(root, "G1", n1="LO-G1-N001")
    put(
        root,
        "lo_rewrites/G1.json",
        {"band": "G1", "rows": [], "new_los": [new("The child sorts coins by size.")]},
    )
    apply_seed.apply(conn, t, teaching_formats=["game"])
    code = conn.execute(
        "select code from learning_objective where title = 'The child sorts coins by size.'"
    ).fetchone()["code"]
    put(
        root,
        "lo_rewrites/G1.json",
        {"band": "G1", "rows": [], "new_los": [new("The child sorts coins by value.")]},
    )
    rep, _ = apply_seed.apply(conn, t, teaching_formats=["game"])
    assert rep.counts() == {"lo_title": 1}
    assert (
        conn.execute("select title from learning_objective where code = %s", (code,)).fetchone()["title"]
        == "The child sorts coins by value."
    )
    asking_as(conn, a_person(conn, f"lo-{uuid.uuid4().hex[:6]}@school.invalid"))
    conn.execute(
        "update learning_objective set title = 'The child lines coins up by size.' where code = %s", (code,)
    )
    put(
        root,
        "lo_rewrites/G1.json",
        {"band": "G1", "rows": [], "new_los": [new("The child sorts coins by weight.")]},
    )
    apply_seed.apply(conn, t, teaching_formats=["game"])
    assert (
        conn.execute("select title from learning_objective where code = %s", (code,)).fetchone()["title"]
        == "The child lines coins up by size."
    )


def _two(ref, title):
    return {
        "ref": ref,
        "title": title,
        "subject_code": "NUM",
        "unit": "Money",
        "signal": "Procedural",
        "confidence": "low",
    }


def test_reordering_or_removing_entries_in_a_file_never_changes_an_existing_code(world):
    conn, t, root = world
    a, b = _two("a", "The child sorts coins by size."), _two("b", "The child names the coin shown.")
    ledger(root, "G1", a="LO-G1-N001", b="LO-G1-N002")
    put(root, "lo_rewrites/G1.json", {"band": "G1", "rows": [], "new_los": [a, b]})
    first = {x["ref"]: x["code"] for x in seed_rows.new_los(conn, t)[1]}
    put(root, "lo_rewrites/G1.json", {"band": "G1", "rows": [], "new_los": [b, a]})
    assert (
        {x["ref"]: x["code"] for x in seed_rows.new_los(conn, t)[1]}
        == first
        == {"a": "LO-G1-N001", "b": "LO-G1-N002"}
    )
    put(root, "lo_rewrites/G1.json", {"band": "G1", "rows": [], "new_los": [b]})
    assert {x["ref"]: x["code"] for x in seed_rows.new_los(conn, t)[1]} == {"b": "LO-G1-N002"}


def test_a_ref_with_no_code_in_the_ledger_is_refused_naming_the_file_and_the_next_free_number(world):
    conn, t, root = world
    ledger(root, "G1", a="LO-G1-N005")
    put(
        root,
        "activities/G1.json",
        {"grade": "G1", "new_los": [_two("zz", "The child sorts coins by size.")], "rows": []},
    )
    _, accepted, done = seed_rows.new_los(conn, t)
    assert (
        accepted == [] and "activities/G1.json" in done.rejected[0][1][0] and "N006" in done.rejected[0][1][0]
    )


def test_a_new_objective_takes_its_label_from_its_subject_code_on_insert_and_on_update(world):
    conn, t, root = world
    ledger(root, "G1", n1="LO-G1-N001")
    put(
        root,
        "lo_rewrites/G1.json",
        {"band": "G1", "rows": [], "new_los": [_two("n1", "The child sorts coins by size.")]},
    )
    apply_seed.apply(conn, t, teaching_formats=["game"])
    name = conn.execute("select name from subject where tenant_id=%s and code='NUM'", (t,)).fetchone()["name"]
    code = "LO-G1-N001"
    assert (
        conn.execute("select subject from learning_objective where code=%s", (code,)).fetchone()["subject"]
        == name
    )
    conn.execute("update learning_objective set subject = 'Wrong label' where code=%s", (code,))
    apply_seed.apply(conn, t, teaching_formats=["game"])
    assert (
        conn.execute("select subject from learning_objective where code=%s", (code,)).fetchone()["subject"]
        == name
    )


def test_a_machine_made_objective_no_ref_names_and_no_activity_uses_is_retired_and_one_with_a_link_is_not(
    world,
):
    conn, t, root = world
    ledger(root, "G1", n1="LO-G1-N001")
    put(
        root,
        "lo_rewrites/G1.json",
        {"band": "G1", "rows": [], "new_los": [_two("n1", "The child sorts coins by size.")]},
    )
    apply_seed.apply(conn, t, teaching_formats=["game"])
    conn.execute(
        "insert into learning_objective (tenant_id, code, band, subject, unit, title, signal, source, subject_code, kind)"
        " select tenant_id, 'LO-G1-N009', band, subject, unit, 'The child counts coins.', signal, 'machine', subject_code, kind"
        " from learning_objective where code='LO-G1-N001' and tenant_id=%s",
        (t,),
    )
    rep, _ = apply_seed.apply(conn, t, teaching_formats=["game"])
    retired = [c["code"] for c in rep.changes if c.get("orphan")]
    assert retired == ["LO-G1-N009"]
    assert (
        conn.execute("select retired from learning_objective where code='LO-G1-N001'").fetchone()["retired"]
        is False
    )


def test_every_new_objective_ref_in_the_seed_files_has_a_code_and_no_code_is_used_twice():
    root = seed_rows.ROOT
    ledger_file = json.loads((root / "new_lo_codes.json").read_text())
    for kind in ("lo_rewrites", "activities"):
        for path in sorted((root / kind).glob("*.json")):
            for n in json.loads(path.read_text()).get("new_los", []):
                assert n["ref"] in ledger_file["codes"][path.stem], (
                    f"{path.name}: {n['ref']} has no code in new_lo_codes.json"
                )
    for grade, refs in ledger_file["codes"].items():
        assert len(set(refs.values())) == len(refs), f"{grade}: a code is on two refs"
        assert max(int(c.rsplit("N", 1)[1]) for c in refs.values()) <= ledger_file["highest"][grade]
