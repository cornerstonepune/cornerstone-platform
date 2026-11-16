"""CP-54 B2: the skills' folders, their code rules and the two machines. No model is called: a made-up asker answers.

The model's own scores come from `engine skill eval <name>` (gold, validator catch, smoke run), recorded in
DECISIONS-LOG.md; here every skill's files are held to the frame and to each other, so a skill that cannot be scored
(a gold answer its own rules refuse, a planted fault whose shape is wrong, a smoke set missing a grade) fails before it is.
"""

import json

import jsonschema
import pytest

from engine.core import db, settings, skill_spec
from engine.skills import evals, machines, rules

ROOT = settings.SEED / "skills"
NAMES = [
    "placement",
    "topic",
    "learning-objective",
    "skill-link",
    "capability-link",
    "behaviour",
    "activity",
    "rubric",
    "materials",
    "question",
]
SKILLS = {p.name: skill_spec.read(p) for p in skill_spec.folders(ROOT)}


def test_the_ten_skills_are_the_ten_standards():
    assert sorted(SKILLS) == sorted(NAMES)


@pytest.mark.parametrize("name", NAMES)
def test_a_skill_meets_the_frame(name):
    s = SKILLS[name]
    for part in ("input", "output"):
        jsonschema.Draft202012Validator.check_schema(s["contract"][part])
    assert s["mode"] in ("write", "choose")
    assert s["validator_model"] != s["writer_model"] or s["mode"] == "choose"
    assert s["sources"], "a skill names the sources it must draw on"
    purposes = [
        p["purpose"] for p, _ in skill_spec.prompt_rows(ROOT) if p["purpose"].startswith(f"skill.{name}")
    ]
    assert sorted(purposes) == [f"skill.{name}", f"skill.{name}.validate"]
    assert not any(c.isupper() and name.startswith(g) for c in name for g in ("G", "K")), (
        "no grade in a skill's name"
    )


@pytest.mark.parametrize("name", NAMES)
def test_every_case_fits_the_contract_and_the_goods_pass_the_code_rules(name):
    s = SKILLS[name]
    for c in evals.cases(s, "gold.json"):
        jsonschema.validate(c["input"], s["contract"]["input"])
        if s["mode"] == "choose":
            codes = {o["code"] for o in c["options"]}
            assert set(c["choice"]) <= codes, c["id"]
            assert rules.choice_faults(s, {"choice": c["choice"]}, codes) == [], c["id"]
        elif (
            "good" in c
        ):  # a case made from a reviewed input has no answer until the server's engine writes one
            jsonschema.validate(c["good"], s["contract"]["output"])
            assert rules.check(s, c["input"], c["good"]) == [], (
                c["id"],
                rules.check(s, c["input"], c["good"]),
            )
    for c in evals.cases(s, "planted_bad_gold.json"):
        jsonschema.validate(c["input"], s["contract"]["input"])
        assert c["fault"], c["id"]
        if s["mode"] == "write":
            jsonschema.validate(
                c["output"], s["contract"]["output"]
            )  # wrong in what it says, not in its shape
    assert len(evals.cases(s, "gold.json")) >= 8 and len(evals.cases(s, "planted_bad_gold.json")) >= 8


@pytest.mark.parametrize("name", NAMES)
def test_the_smoke_set_is_three_grades_by_two_subjects(name):
    s = SKILLS[name]
    smoke = evals.cases(s, "smoke.json")
    assert len({c["grade"] for c in smoke}) >= 3 and len({c["subject"] for c in smoke}) >= 2
    for c in smoke:
        jsonschema.validate(c["input"], s["contract"]["input"])
        assert c["grade"] and c["subject"]


def test_planted_faults_are_caught_by_code_where_code_can_and_otherwise_left_to_the_validator():
    caught = {
        n: sum(bool(rules.check(s, c["input"], c["output"])) for c in evals.cases(s, "planted_bad_gold.json"))
        for n, s in SKILLS.items()
        if s["mode"] == "write"
    }
    assert all(v >= 1 for v in caught.values()), f"a WRITE skill whose rules catch no planted fault: {caught}"


# --- the machines, with an asker made up for the test --------------------------------------------------------------

LO = SKILLS["learning-objective"]
GOLD = evals.cases(LO, "gold.json")[0]
GOOD = GOLD["good"]


def asker(*replies):
    """An asker that answers each call from `replies`, in order, and remembers what it was asked."""
    asked: list[tuple[str, dict]] = []
    queue = list(replies)

    def ask(purpose, variables, about):
        asked.append((purpose, variables))
        return queue.pop(0)

    ask.asked = asked  # type: ignore[attr-defined]
    return ask


PASS = {"verdict": "pass", "faults": []}


def test_write_passes_a_good_answer_through_code_and_the_validator():
    ask = asker(GOOD, PASS)
    got = machines.write(LO, GOLD["input"], ask)
    assert (got.status, got.calls) == ("ok", 2)
    assert [p for p, _ in ask.asked] == ["skill.learning-objective", "skill.learning-objective.validate"]


def test_write_retries_once_naming_every_failure_then_refuses():
    bad = {**GOOD, "text": "The child understands counting, and knows tens."}
    ask = asker(bad, bad)
    got = machines.write(LO, GOLD["input"], ask)
    assert got.status == "refused" and got.calls == 2 and got.faults
    first, second = (v for _, v in ask.asked)
    assert "none" in first["failures"] and "understands" in second["failures"]
    assert len(got.attempts) == 2  # both kept, for a person


def test_write_does_not_ask_the_validator_about_what_code_refused():
    ask = asker({**GOOD, "text": "Counting."}, GOOD, PASS)
    got = machines.write(LO, GOLD["input"], ask)
    assert got.status == "ok" and got.calls == 3
    assert [p.endswith("validate") for p, _ in ask.asked] == [False, False, True]


def test_the_validator_can_send_it_back():
    fail = {"verdict": "fail", "faults": [{"rule": "fits the grade", "why": "too hard"}]}
    got = machines.write(LO, GOLD["input"], asker(GOOD, fail, GOOD, PASS))
    assert got.status == "ok" and got.calls == 4


def test_a_reply_off_its_schema_is_a_refusal_not_a_guess():
    got = machines.write(LO, GOLD["input"], asker({"_refused": "no JSON"}, {"_refused": "no JSON"}))
    assert got.status == "refused" and got.output is None


def test_input_off_its_contract_is_refused_before_any_call():
    ask = asker()
    with pytest.raises(machines.SkillRefusal):
        machines.write(LO, {"grade": "G3"}, ask)
    assert ask.asked == []


def test_choose_refuses_a_code_that_is_not_on_the_list_and_takes_none():
    s = {**SKILLS["skill-link"]}
    opts = [
        {"code": "NUM.OPS.01", "name": "Add", "what": "adds"},
        {"code": "NUM.OPS.02", "name": "Sub", "what": "subtracts"},
    ]
    given = evals.cases(s, "gold.json")[0]["input"]
    off = machines.choose(s, given, opts, asker({"choice": ["NUM.XXX.99"], "reason": "x"}))
    assert off.status == "refused" and "not on the list" in off.faults[0]
    none = machines.choose(s, given, opts, asker({"choice": [], "reason": "nothing is about it"}))
    assert (
        none.status == "refused" and "none is not allowed" in none.faults[0]
    )  # nothing is left empty (Nimish, 16 Nov)
    assert machines.choose(s, given, [], asker()).status == "none"  # nothing to choose from: no call


def test_choose_takes_no_more_than_the_standard_allows():
    s = SKILLS["placement"]
    opts = [{"code": "A", "name": "a"}, {"code": "B", "name": "b"}]
    got = machines.choose(
        s, evals.cases(s, "gold.json")[0]["input"], opts, asker({"choice": ["A", "B"], "reason": "x"})
    )
    assert got.status == "refused" and "at most 1" in got.faults[0]


# --- the eval's arithmetic, and the rows the loader makes --------------------------------------------------------


def test_a_perfect_asker_scores_a_perfect_gold_and_a_validator_that_passes_everything_fails_the_catch():
    def ask(purpose, variables, about):
        if purpose.endswith(".validate"):
            return PASS
        case = next((c for c in evals.cases(LO, "gold.json") if c["input"] == variables["inputs"]), None)
        return case["good"] if case else {"_refused": "not a gold case"}  # the smoke cases are not asked here

    scores = evals.evaluate(LO, ask)
    assert scores["gold"] == 1.0 and scores["clean"] == 1.0 and scores["catch"] == 0.0


def test_the_loader_makes_two_prompt_rows_a_skill_and_none_is_active_before_its_eval():
    rows = skill_spec.prompt_rows(ROOT)
    assert len(rows) == 2 * len(NAMES)
    for p, text in rows:
        assert "{{standard}}" not in text and "{{sources}}" not in text and "{{title}}" not in text
        assert p["purpose"].startswith("skill.") and p["model"]
    names_active = {p["purpose"] for p, _ in rows if p["active"]}
    assert names_active <= {f"skill.{n}{v}" for n in NAMES for v in ("", ".validate")}


def test_loading_the_settings_puts_the_skills_prompts_in_and_a_second_load_changes_nothing():
    with db.connect() as conn:
        t = conn.execute("select id from tenant where slug = %s", (db.tenant_slug(),)).fetchone()["id"]
        settings.load_prompts(conn, t)
        n = conn.execute(
            "select count(*) n from prompt where tenant_id = %s and purpose like 'skill.%%'", (t,)
        ).fetchone()["n"]
        assert n == 2 * len(NAMES)
        settings.load_prompts(conn, t)
        assert (
            conn.execute(
                "select count(*) n from prompt where tenant_id = %s and purpose like 'skill.%%'", (t,)
            ).fetchone()["n"]
            == n
        )
        conn.rollback()


def test_every_skill_is_held_to_its_bars():
    """A skill with no bar on record cannot pass its eval (checks/bars.py): the bars are rows, set before the run."""
    seed = json.loads((settings.SEED / "thresholds.json").read_text())["thresholds"]
    keys = {r["key"] for r in seed}
    for n in NAMES:
        for m in evals.MEASURES:
            assert f"skill_bar.{n}.{m}" in keys, f"skill_bar.{n}.{m}"
