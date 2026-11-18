"""CP-54: an outside statement held against the school's objectives of any grade (`w1_bank/stmt_match.py`).
Placeholder objectives and statements, a fake model, settings given by a dict, a rolled-back transaction: no school data
and no framework's words."""

import json
import os
import uuid
from pathlib import Path

import pytest

from engine.core import db
from engine.w1_bank import cli_stmt_match
from engine.w1_bank import stmt_match as sm

SEED = Path(__file__).resolve().parents[3] / "supabase" / "seed"
SETTINGS = {
    "stmt.shortlist_size": 2,
    "stmt.min_shared": 2,
    "stmt.max_matches": 3,
    "stmt.plain_words": ["the", "and"],
    "stmt.scope": {"ZZ-A": {"kinds": ["x"], "levels": ["L1"], "subject": "NUM"}},
    "stmt.area_subject": {"math": "NUM"},
}


@pytest.fixture(autouse=True)
def settings(monkeypatch):
    monkeypatch.setattr(
        sm.settings, "config", lambda conn, key, default=None, tenant=None: SETTINGS.get(key, default)
    )


@pytest.fixture
def LOS():
    return make_los()


def lo(code, band, subject, title, unit="Unit"):
    return sm.Objective(code, band, subject, unit, title, sm.stems_of(None, f"{unit} {title}"))


def make_los():
    return [
        lo("A1", "G1", "NUM", "Count objects up to twenty"),
        lo("A2", "G3", "NUM", "Count in tens and hundreds objects"),
        lo("A3", "G2", "NUM", "Count coins and objects in rupees"),
        lo("B1", "G1", "SCI", "Count the legs of animals and objects"),
    ]


def fake(replies):
    calls = []

    def ask(variables, about):
        calls.append(variables)
        return replies

    ask.calls = calls  # type: ignore[attr-defined]
    return ask


def pick(code, rel="meets"):
    return {"objective_code": code, "relation": rel, "confidence": 0.8, "reason": "the words"}


def test_the_shortlist_is_the_statements_subject_of_any_grade_most_shared_words_first_and_no_longer_than_the_setting(
    LOS,
):
    st = sm.Statement("ZZ-A", "s1", "Count objects and count in tens", "NUM")
    got = sm.shortlist(None, st, LOS)
    assert [o.code for o, _ in got] == ["A2", "A1"], (
        "the setting's 2, grades G3 and G1 side by side, B1 (other subject) never"
    )
    assert {o.band for o, _ in got} == {"G1", "G3"}


def test_a_statement_with_no_subject_is_held_against_every_subject(LOS):
    st = sm.Statement("ZZ-B", "s2", "Count the legs of animals", None)
    assert "B1" in [o.code for o, _ in sm.shortlist(None, st, LOS)]


def test_a_statement_sharing_fewer_words_than_the_setting_is_no_match_written_by_code_with_no_model_call(LOS):
    st = sm.Statement("ZZ-A", "s3", "Count the lakes", "NUM")  # one shared word with every objective
    ask = fake({"matches": [pick("A1")]})
    a = sm.answer(None, st, LOS, ask)
    assert not a.matches and not a.asked and not ask.calls and "no match" in a.reason


def test_up_to_the_setting_matches_each_with_a_relation_and_a_code_off_the_list_or_a_relation_off_the_three_is_refused(
    LOS,
):
    st = sm.Statement("ZZ-A", "s1", "Count objects and count in tens", "NUM")
    reply = {
        "matches": [
            pick("A2", "partly_meets"),
            pick("A9"),
            pick("A1", "equals"),
            pick("A2"),
            pick("A1", "extends"),
        ]
    }
    a = sm.answer(None, st, LOS, fake(reply))
    assert [(m.code, m.relation) for m in a.matches] == [("A2", "partly_meets"), ("A1", "extends")]
    assert (
        len(a.problems) == 3 and any("A9" in p for p in a.problems) and any("equals" in p for p in a.problems)
    )
    assert any("named twice" in p for p in a.problems)


def test_a_none_is_a_valid_answer_and_a_malformed_reply_is_a_refusal_not_a_crash(LOS):
    st = sm.Statement("ZZ-A", "s1", "Count objects and count in tens", "NUM")
    assert not sm.answer(None, st, LOS, fake({"matches": []})).problems
    assert not sm.answer(None, st, LOS, fake({"matches": "A1"})).matches


def test_the_sample_is_the_same_askable_statements_every_time():
    items = [sm.Statement("ZZ-A", f"s{i}", "t", "NUM") for i in range(30)]
    first = cli_stmt_match.spread(items, 5)
    assert first == cli_stmt_match.spread(list(reversed(items)), 5) and len(first) == 5


def test_the_score_is_against_the_earlier_machine_links_as_a_reference_and_counts_refusals(LOS):
    st = sm.Statement("ZZ-A", "s1", "Count objects and count in tens", "NUM")
    good = sm.answer(None, st, LOS, fake({"matches": [pick("A2")]}))
    bad = sm.answer(None, st, LOS, fake({"matches": [pick("A9")]}))
    held = {("ZZ-A", "s1"): {"A2"}}
    assert sm.score([good], held) == {"statements": 1, "shortlist_recall": 1.0, "agree": 1.0, "refused": 0.0}
    assert sm.score([good, bad], held)["agree"] == 0.5 and sm.score([good, bad], held)["refused"] == 0.5


def test_the_prompt_is_a_row_off_until_scored_with_its_bars_and_the_matcher_is_paid_from_cp_54_campaign():
    rows = json.loads((SEED / "prompts.json").read_text())["prompts"]
    (p,) = [r for r in rows if r["purpose"] == sm.PURPOSE and r["version"] == 1]
    assert p["active"] is False and p["version"] == 1
    assert (SEED / p["text_file"]).read_text().count("{{candidates}}") == 1
    assert p["json_schema"]["properties"]["matches"]["maxItems"] == 3
    keys = {t["key"] for t in json.loads((SEED / "thresholds.json").read_text())["thresholds"]}
    assert {f"eval.{sm.PURPOSE}.{m}" for m in ("agree", "shortlist_recall", "refused_at_most")} <= keys
    cfg = {c["key"]: c["value"] for c in json.loads((SEED / "config.json").read_text())["config"]}
    assert sm.PURPOSE in cfg["llm.campaigns"]["cp-54"]["purposes"]
    assert 1 in cfg["llm.structured"][sm.PURPOSE], "the vendor holds the reply to its field names"
    assert set(cfg["stmt.scope"]) and cfg["stmt.shortlist_size"] == 8 and cfg["stmt.max_matches"] == 3


def test_v2_is_a_stricter_row_off_until_scored_held_to_its_schema_and_run_by_a_fixed_command():
    """v2 (CP-54): an objective counts only when both the thing and the action are covered; v1 stays for comparison."""
    rows = [
        r for r in json.loads((SEED / "prompts.json").read_text())["prompts"] if r["purpose"] == sm.PURPOSE
    ]
    v1, v2 = sorted(rows, key=lambda r: r["version"])
    assert (v1["version"], v2["version"], v2["active"]) == (1, 2, False)
    assert v2["json_schema"] == v1["json_schema"], "the same reply shape, so the same code checks hold"
    text = (SEED / v2["text_file"]).read_text()
    assert (
        text.count("{{candidates}}") == 1
        and "{{most}}" in text
        and "AND" in text
        and "cambridge" not in text.lower()
    )
    cfg = {c["key"]: c["value"] for c in json.loads((SEED / "config.json").read_text())["config"]}
    assert {1, 2} <= set(cfg["llm.structured"][sm.PURPOSE])
    from importlib import util

    spec = util.spec_from_file_location("cmd", SEED.parents[1] / ".github" / "curriculum" / "command.py")
    cmd = util.module_from_spec(spec)
    spec.loader.exec_module(cmd)
    assert "--version 2" in " ".join(cmd.RUNS["stmt_match_sample_v2"]["commands"][0])


def test_no_publishers_wording_in_the_prompt_or_the_matcher():
    text = "".join(p.read_text() for p in [SEED / "prompts/statement_match.v1.txt", Path(sm.__file__)])
    assert "cambridge" not in text.lower()


@pytest.fixture
def world(conn_):
    conn = conn_
    t = conn.execute("select id from tenant where slug = %s", (db.tenant_slug(),)).fetchone()["id"]
    tag = uuid.uuid4().hex[:6].upper()
    band = f"Z{tag[:3]}"
    fw = f"ZT-{tag}"
    conn.execute(
        "insert into grade (tenant_id, code, name, ord) values (%s, %s, 'Placeholder grade', 900)", (t, band)
    )
    conn.execute(
        "insert into framework (tenant_id, code, name, publisher, kind) values (%s, %s, 'Placeholder', 'Placeholder', 'national')",
        (t, fw),
    )
    for c in ("S1", "S2"):
        conn.execute(
            "insert into framework_statement (tenant_id, framework_code, code, kind, text) values (%s,%s,%s,'competency','placeholder words')",
            (t, fw, c),
        )
    for c in ("LO1", "LO2"):
        conn.execute(
            "insert into learning_objective (tenant_id, code, band, subject, unit, title, signal)"
            " values (%s,%s,%s,'Maths','Number','Count things','Foundational')",
            (t, f"LO-{tag}-{c}", band),
        )
    return conn, t, fw, [f"LO-{tag}-LO1", f"LO-{tag}-LO2"]


@pytest.fixture
def conn_():
    if not os.getenv("DATABASE_URL"):
        pytest.skip("needs DATABASE_URL (see .env.example)")
    with db.connect() as c:
        yield c
        c.rollback()


def test_a_match_is_a_machine_link_of_one_run_never_over_a_persons_and_the_run_is_undone_as_a_whole(world):
    conn, t, fw, los = world
    conn.execute(
        "insert into objective_statement (tenant_id, lo_code, framework_code, statement_code, relation, source)"
        " values (%s,%s,%s,'S1','meets','person')",
        (t, los[0], fw),
    )
    st1, st2 = sm.Statement(fw, "S1", "w", None), sm.Statement(fw, "S2", "w", None)
    run = uuid.uuid4()
    a1 = sm.Answer(st1, matches=[sm.Match(los[0], "extends", 0.9, "r"), sm.Match(los[1], "meets", 0.9, "r")])
    a2 = sm.Answer(st2, matches=[sm.Match(los[0], "partly_meets", 0.7, "r")])
    assert sm.record(conn, t, run, a1) == 1, "the person's link on S1 is kept; only the new one is made"
    assert sm.record(conn, t, run, a2) == 1
    rows = conn.execute(
        "select lo_code, statement_code, relation, source from objective_statement where tenant_id = %s and framework_code = %s order by 1,2",
        (t, fw),
    ).fetchall()
    assert [
        (r["source"], r["relation"]) for r in rows if r["lo_code"] == los[0] and r["statement_code"] == "S1"
    ] == [("person", "meets")]
    assert {st.code for st in sm.statements(conn, t, fw)} <= {"S1", "S2"}
    assert sm.revert(conn, t, run) == 2
    left = conn.execute(
        "select source from objective_statement where tenant_id = %s and framework_code = %s", (t, fw)
    ).fetchall()
    assert [r["source"] for r in left] == ["person"]


def test_a_run_stops_when_it_spends_past_its_ceiling_or_too_many_answers_are_refused_and_not_before_enough_are_asked():
    stop = cli_stmt_match.stop_reason
    assert stop(10, 10, 5.0, 400, 0.02) == "", "ten answers say nothing about a share"
    assert stop(100, 2, 50.0, 400, 0.02) == "" and stop(100, 3, 50.0, 400, 0.02) != ""
    assert "past the" in stop(100, 0, 401.0, 400, 0.02)
    assert stop(100, 50, 9999.0, 0, 0) == "", "0 turns both guards off (a sample)"
