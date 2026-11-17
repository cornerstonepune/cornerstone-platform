"""CP-54 code fixes (handover "Failure categories", step 1): what code decides about the four scored skills, so neither the
writer, the chooser nor the validator is asked it (CLAUDE.md rule 11). No model is called: a made-up asker answers, and one
that is not to be asked raises. The lists code reads are built from the TUNE half of the gold only; the tests below rebuild
them from the tune half and hold the files to that recipe, so a held answer can never shape them."""

import collections
import re

import pytest

from engine.core import settings, skill_spec
from engine.skills import evals, machines, rules, rules_choose
from engine.w1_bank import chain_choose

ROOT = settings.SEED / "skills"
LO = skill_spec.read(ROOT / "learning-objective")
CL = skill_spec.read(ROOT / "capability-link")
PL = skill_spec.read(ROOT / "placement")
SL = skill_spec.read(ROOT / "skill-link")
PASS = {"verdict": "pass", "faults": []}


def tune(skill):
    return {c["id"]: c for c in evals.cases(skill, "gold.json", "tune")}


def asker(*replies):
    asked: list[tuple[str, dict]] = []
    queue = list(replies)

    def ask(purpose, variables, about):
        asked.append((purpose, variables))
        return queue.pop(0)

    ask.asked = asked  # type: ignore[attr-defined]
    return ask


def out(got: machines.Outcome) -> dict:
    assert got.output is not None
    return got.output


def never(purpose, variables, about):
    raise AssertionError(f"code decides {about}: no model is asked")


# --- A. learning objective: a condition no source gives passes as a written assumption ---------------------------------

THERMO = tune(LO)["LO-G1-0065-ok"]  # approved: "The child reads the temperature on a simple thermometer."
INVENTED = {
    **THERMO["good"],
    "text": "The child reads the temperature up to 50 degrees on a simple thermometer.",  # 50 is in no source
}


def test_an_approved_answer_with_an_invented_but_assumed_range_passes():
    out = {
        **INVENTED,
        "confidence": "low",
        "assumption": "the sources give no range; 50 degrees suits a G1 thermometer",
    }
    assert rules.check(LO, THERMO["input"], out) == []


def test_the_same_answer_sure_of_itself_with_no_assumption_fails():
    faults = rules.check(LO, THERMO["input"], {**INVENTED, "confidence": "high"})
    assert any("range 50" in f and "assumption" in f for f in faults), faults
    low_unsaid = rules.check(LO, THERMO["input"], {**INVENTED, "confidence": "low", "assumption": " "})
    assert any("range 50" in f for f in low_unsaid)


def test_materials_the_writer_chose_are_not_a_fault_and_a_range_from_a_source_needs_no_assumption():
    picture_cards = tune(LO)["LO-G1-0126-ok"]  # approved, "using picture cards", high, no assumption
    assert rules.check(LO, picture_cards["input"], picture_cards["good"]) == []
    tables = tune(LO)["LO-G2-0492-ok"]  # "for 2 to 5 and 10": every number is in the source
    assert rules.check(LO, tables["input"], tables["good"]) == []


def test_a_seed_files_row_states_no_confidence_and_is_not_held_to_the_writers_range_rule():
    row = {k: v for k, v in INVENTED.items() if k != "confidence"}
    assert not any("range" in f for f in rules.check(LO, THERMO["input"], row))


def test_the_validator_reads_the_loosened_rule_and_the_writer_and_validator_share_it():
    texts = {p["purpose"]: t for p, t in skill_spec.prompt_rows(ROOT)}
    for purpose in ("skill.learning-objective", "skill.learning-objective.validate"):
        t = texts[purpose]
        assert "A range is never invented" not in t
        assert "passes only with `confidence` low" in t and "are not a fault" in t
    assert "assumption" in LO["contract"]["output"]["properties"]
    assert LO["version"] == 3  # the prompt's text changed, so it is a new version (CLAUDE.md rule 2)


# --- B. learning objective: the signal of a listed verb is computed --------------------------------------------------


def test_the_verb_signal_list_is_built_from_the_tune_half_only():
    """The recipe: a verb whose tune answers number 2 or more and all give one signal. Held cases are never read."""
    seen = collections.defaultdict(set)
    count = collections.Counter()
    for c in evals.cases(LO, "gold.json", "tune"):
        if "good" in c:
            m = re.match(r"The child ([\w-]+)", c["good"]["text"])
            assert m, c["id"]
            v = m.group(1).lower()
            seen[v].add(c["good"]["signal"])
            count[v] += 1
    made = {v: next(iter(s)) for v, s in seen.items() if count[v] >= 2 and len(s) == 1}
    assert LO["lists"]["verb_signal"] == made


def test_code_sets_the_signal_of_a_listed_verb_and_keeps_the_writers_otherwise():
    case = tune(LO)["LO-G3-1236-ok"]  # "The child draws a pattern …"
    wrong = {**case["good"], "signal": "Procedural"}
    got = machines.write(LO, case["input"], asker(wrong, PASS))
    assert got.status == "ok" and out(got)["signal"] == LO["lists"]["verb_signal"]["draws"]
    other = {**THERMO["good"], "signal": "Application"}  # "reads" gives several signals in the tune half
    assert rules.compute(LO, THERMO["input"], other)["signal"] == "Application"


# --- C. learning objective: a sibling that says the same ---------------------------------------------------------------


def test_an_objective_that_says_what_a_sibling_says_is_refused_whatever_the_child_opening():
    case = tune(LO)["LO-G1-0126-ok"]
    sib = "matches an animal to the habitat it lives in, using picture cards"
    faults = rules.check(LO, {**case["input"], "siblings": [sib]}, case["good"])
    assert any("sibling" in f for f in faults), faults


# --- D. capability link: an academic objective takes its subject default by code; the rest start from it --------------

CL_CASE = tune(CL)["LO-G1-0081"]  # "Understanding events that are certain …": the default is a right answer
# the switch set back to asking (option a), as data
CL_ASK = {**CL, "lists": {**CL["lists"], "academic": "ask"}}


def test_the_verb_groups_list_is_built_from_the_tune_half_only():
    """The recipe: a verb whose tune cases number 2 or more, never keep the default, and all reach one capability."""
    by = collections.defaultdict(list)
    for c in evals.cases(CL, "gold.json", "tune"):
        v = rules_choose.verb(c["input"]["objective"], CL["lists"]["heading_starts"])
        if v:
            caps = {x.split(".")[0] for x in c["choice_in"]}
            by[v].append((c["input"]["domain_default"] in c["choice_in"], caps))
    made = {
        v: next(iter(seen[0][1]))
        for v, seen in by.items()
        if len(seen) >= 2 and not any(kept for kept, _ in seen) and len({frozenset(c) for _, c in seen}) == 1
        and len(seen[0][1]) == 1
    }  # fmt: skip
    assert CL["lists"]["verb_groups"] == made


def test_the_skill_answers_academic_objectives_by_its_subject_default_as_its_lists_file_says():
    """Orchestrator, 17 Nov: on the tune half the model left the default 4 times and was right 0 times. The switch is a
    row of the skill's own lists.json, never code."""
    assert CL["lists"]["academic"] == "default"


def test_an_academic_objective_takes_the_subject_default_by_code_with_no_call_low_with_its_assumption():
    got = machines.choose(CL, CL_CASE["input"], CL_CASE["options"], never)
    o = out(got)
    assert (got.status, got.calls, o["choice"]) == ("ok", 0, [CL_CASE["input"]["domain_default"]])
    assert o["confidence"] == "low" and "subject default" in o["assumption"]
    assert "Understanding" in o["reason"] and "subject default" in o["reason"]


def test_an_objective_with_no_kind_given_is_academic_and_takes_the_subject_default():
    given = {k: v for k, v in CL_CASE["input"].items() if k != "kind"}
    got = machines.choose(CL, given, CL_CASE["options"], never)
    assert got.calls == 0 and out(got)["choice"] == [given["domain_default"]]


def test_a_switch_that_is_neither_default_nor_ask_is_refused_not_guessed():
    bad = {**CL, "lists": {**CL["lists"], "academic": "defualt"}}
    with pytest.raises(ValueError, match="academic"):
        machines.choose(bad, CL_CASE["input"], CL_CASE["options"], never)


def test_with_the_switch_set_to_ask_an_academic_objective_is_asked_and_the_default_it_keeps_stands():
    default = CL_CASE["input"]["domain_default"]
    ask = asker(
        {"choice": [default], "reason": "understanding numbers", "confidence": "high", "assumption": ""}
    )
    got = machines.choose(CL_ASK, CL_CASE["input"], CL_CASE["options"], ask)
    assert (got.calls, out(got)["choice"], out(got)["confidence"]) == (1, [default], "high")


LEAVE = "v2-reasoning.weigh-evidence"  # "Weighing evidence": not the default of this Numeracy objective


def test_leaving_the_default_with_a_reason_that_names_the_verb_and_the_group_is_kept():
    reason = "Understanding how likely an event is, is weighing evidence"
    ask = asker({"choice": [LEAVE], "reason": reason, "confidence": "high", "assumption": ""})
    got = machines.choose(CL_ASK, CL_CASE["input"], CL_CASE["options"], ask)
    assert out(got)["choice"] == [LEAVE] and out(got)["confidence"] == "high" and out(got)["reason"] == reason


@pytest.mark.parametrize(
    "reason",
    ["", "it is about chance", "weighing evidence"],  # empty; neither; the group's words but not the verb
)
def test_leaving_the_default_with_a_reason_that_does_not_name_both_is_turned_back_to_the_default_low(reason):
    ask = asker({"choice": [LEAVE], "reason": reason, "confidence": "high", "assumption": ""})
    got = machines.choose(CL_ASK, CL_CASE["input"], CL_CASE["options"], ask)
    o = out(got)
    assert got.status == "ok" and o["choice"] == [CL_CASE["input"]["domain_default"]]
    assert o["confidence"] == "low" and o["assumption"] and o["reason"]


def test_a_heading_with_no_verb_takes_the_default_marked_low_with_its_assumption():
    given = {**CL_CASE["input"], "objective": "Title: India on the Globe"}
    got = machines.choose(CL, given, CL_CASE["options"], never)
    assert out(got)["choice"] == [given["domain_default"]] and got.calls == 0
    assert out(got)["confidence"] == "low" and out(got)["assumption"]


@pytest.mark.parametrize("skill", [CL, CL_ASK], ids=["default", "ask"])
@pytest.mark.parametrize(
    "change",
    [
        {"kind": "character"},  # a character objective has no default (standard 6)
        {"domain_default": "not-on-the-list"},  # the spine reaches another capability
    ],
)
def test_with_no_default_to_start_from_the_model_is_asked_and_its_pick_stands(change, skill):
    ask = asker({"choice": [LEAVE], "reason": "", "confidence": "high", "assumption": ""})
    got = machines.choose(skill, {**CL_CASE["input"], **change}, CL_CASE["options"], ask)
    assert got.calls == 1 and out(got)["choice"] == [LEAVE]


def test_a_routine_is_asked_starting_from_its_default_and_leaving_it_needs_the_named_reason():
    """A routine has no subject, so it is not an academic objective code may answer: the model is asked (standard 4)."""
    ask = asker({"choice": [LEAVE], "reason": "", "confidence": "high", "assumption": ""})
    got = machines.choose(CL, {**CL_CASE["input"], "kind": "routine"}, CL_CASE["options"], ask)
    assert got.calls == 1 and out(got)["choice"] == [CL_CASE["input"]["domain_default"]]
    assert out(got)["confidence"] == "low"


def test_a_pick_with_no_default_is_marked_low_when_inexact_and_its_reason_is_never_empty():
    ask = asker({"choice": [LEAVE], "reason": "", "confidence": "high", "assumption": ""})
    got = machines.choose(CL, {**CL_CASE["input"], "kind": "character"}, CL_CASE["options"], ask)
    o = out(got)
    assert o["reason"] and "Weighing evidence" in o["reason"] and "Understanding" in o["reason"]
    assert o["confidence"] == "low" and o["assumption"]


def test_the_eval_reports_how_often_the_default_was_left_and_how_often_rightly():
    """Every asked case leaves the default: for the gold's group where the gold leaves it too, else for a wrong group."""
    gold = evals.cases(CL, "gold.json", "tune")
    by_id = {c["id"]: c for c in gold}

    def ask(purpose, variables, about):
        if purpose.endswith(".validate"):
            return PASS
        c = by_id.get(about)
        if c is None:  # a smoke case: not counted here
            return {"_refused": "smoke"}
        default = c["input"]["domain_default"]
        wrong = [o["code"] for o in c["options"] if o["code"] not in c["choice_in"] and o["code"] != default]
        pick = c["choice_in"][0] if default not in c["choice_in"] else wrong[0]
        name = next(o["name"] for o in c["options"] if o["code"] == pick)
        return {
            "choice": [pick],
            "reason": f"{c['input']['objective']}: {name}",
            "confidence": "high",
            "assumption": "",
        }

    asked = [
        c
        for c in gold
        if rules_choose.verb(c["input"]["objective"], CL["lists"]["heading_starts"]) is not None
    ]
    scores = evals.evaluate(CL_ASK, ask, split="tune")
    assert scores["left_default"] == len(asked) > 0
    assert scores["left_default_right"] == sum(
        c["input"]["domain_default"] not in c["choice_in"] for c in asked
    )
    assert 0 < scores["left_default_right"] < scores["left_default"]
    assert "left_default" not in evals.evaluate(PL, lambda p, v, a: {"_refused": "x"}, split="tune")


def test_the_eval_scores_the_path_the_chain_runs_academic_cases_take_the_default_with_no_maker_call():
    """The eval goes through machines.choose too: with the file's switch every gold case is answered by code, the default
    is never left, and the gold score is the share of cases whose coordinator kept the default."""
    gold = evals.cases(CL, "gold.json", "tune")
    maker = []

    def ask(purpose, variables, about):
        if purpose.endswith(".validate"):
            return PASS
        maker.append(about)
        return {"_refused": "a smoke case"}

    scores = evals.evaluate(CL, ask, split="tune")
    assert [a for a in maker if a in {c["id"] for c in gold}] == []
    assert scores["left_default"] == 0 and scores["left_default_right"] == 0
    kept = sum(c["input"]["domain_default"] in c["choice_in"] for c in gold)
    assert scores["gold"] == pytest.approx(kept / len(gold))
    by = evals.calls(CL, "tune")
    assert by[skill_spec.purpose("capability-link")] == sum(
        rules_choose.first(CL, c["input"], c["options"])[0] is None for c in evals.cases(CL, "smoke.json")
    )


# --- E. placement: exact lookups from the options --------------------------------------------------------------------


@pytest.mark.parametrize("cid", ["K2-Hindi", "G2-Visual Arts", "G2-Circle Time", "K2-Curiosity"])
def test_a_label_that_is_a_places_own_name_is_placed_by_code(cid):
    case = tune(PL)[cid]
    got = machines.choose(PL, case["input"], case["options"], never)
    assert (got.calls, out(got)["choice"]) == (0, case["choice"])
    assert case["input"]["label"] in out(got)["reason"]


def test_a_character_area_matches_its_name_whatever_the_ampersand():
    opts = [
        {"code": "character:empathy-happiness", "name": "Empathy Happiness", "what": "a character area"},
        {"code": "routine:assembly", "name": "Assembly", "what": "a routine"},
    ]
    got = machines.choose(PL, {"grade": "K2", "label": "Empathy & Happiness"}, opts, never)
    assert out(got)["choice"] == ["character:empathy-happiness"]


def test_a_label_that_is_no_places_name_goes_to_the_model_and_a_part_keeps_its_own_confidence():
    case = tune(PL)["K2-Rhymes & Songs"]
    ask = asker({"choice": ["part:ENG"], "reason": "", "confidence": "high", "assumption": ""})
    got = machines.choose(PL, case["input"], case["options"], ask)
    o = out(got)
    assert got.calls == 1 and o["choice"] == ["part:ENG"]
    assert "Rhymes & Songs" in o["reason"] and "English" in o["reason"]
    assert (
        o["confidence"] == "high"
    )  # a part is never the subject's name: held_pl (17 Nov) read a forced low as a fault


def test_four_kinds_only():
    assert rules.check(PL, {"grade": "K2", "label": "x"}, {"choice": ["unit:ART"]})
    assert rules.check(PL, {"grade": "K2", "label": "x"}, {"choice": ["part:ART"]}) == []


# --- F. skill link: stay in the subject; the reason names the words --------------------------------------------------

SL_OPTS = [
    {"code": "LO-1", "name": "Add 3-digit numbers", "what": "Addition", "subject_code": "NUM"},
    {"code": "LO-2", "name": "Science week experiments", "what": "Science Week", "subject_code": "SCI"},
    {"code": "LO-3", "name": "Read a story aloud", "what": "Reading", "subject_code": "ENG"},
]
SL_IN = {"grade": "G3", "subject": "Numeracy", "unit": "Addition", "objective": "Adds two 3-digit numbers",
         "subject_code": "NUM"}  # fmt: skip


def test_the_list_is_kept_to_the_objectives_subject_before_the_model_sees_it():
    ask = asker({"choice": ["LO-1"], "reason": "adds: Add", "confidence": "high", "assumption": ""})
    got = machines.choose(SL, SL_IN, SL_OPTS, ask)
    assert ask.asked[0][1]["options"].splitlines() == ["LO-1 | Add 3-digit numbers | Addition"]
    assert out(got)["choice"] == ["LO-1"] and out(got)["confidence"] == "high"


def test_a_subject_with_nothing_on_the_list_keeps_the_whole_list():
    ask = asker({"choice": ["LO-2"], "reason": "x", "confidence": "high", "assumption": ""})
    machines.choose(SL, {**SL_IN, "subject_code": "MUS"}, SL_OPTS, ask)
    assert len(ask.asked[0][1]["options"].splitlines()) == 3


def test_an_inexact_skill_link_is_marked_low_and_its_reason_names_the_words():
    ask = asker({"choice": ["LO-3"], "reason": "", "confidence": "high", "assumption": ""})
    got = machines.choose(SL, {**SL_IN, "subject_code": "ENG"}, SL_OPTS, ask)
    o = out(got)
    assert "Adds two 3-digit numbers" in o["reason"] and "Read a story aloud" in o["reason"]
    assert o["confidence"] == "low" and o["assumption"]


def test_the_eval_poses_a_skill_link_case_with_the_subjects_the_chain_would_give_and_never_changes_the_file():
    case = tune(SL)[
        "MD.MULTIPLES"
    ]  # its file input says "Science": the subject code is the engine skill's own
    posed = evals.with_subjects(SL, case)
    assert posed["input"]["subject_code"] == "NUM" and "subject_code" not in case["input"]
    assert set(case["choice"]) <= {o["code"] for o in posed["options"] if o.get("subject_code") == "NUM"}


# --- C. held/tune faults of 17 Nov: placement exactness, skill-link one pick, capability map and headings -----------


def _pl(label, options):
    return [o for o in options if o["code"] in label]


@pytest.mark.parametrize(
    ("label", "code", "exact"),
    [
        ("FMS", "subject:FMS", True),  # a short form is the subject's name
        ("Maths", "subject:NUM", True),  # "Maths" starts "Mathematics"
        ("Empathy & Happiness", "character:empathy-happiness", True),
        ("Science & Geo", "subject:SCI", False),  # one shared word is not the name
        ("Rhymes & Songs", "part:ENG", True),  # a part: the model's own confidence stands
    ],
)
def test_placement_exactness_knows_short_forms_and_needs_every_word(label, code, exact):
    case = next(c for c in evals.cases(PL, "gold.json") if any(o["code"] == code for o in c["options"]))
    picked = [o for o in case["options"] if o["code"] == code]
    assert rules_choose.placement_exact(PL["lists"], {"label": label}, picked, case["options"]) is exact


def test_placement_code_answer_names_a_character_area_and_a_short_form_needs_no_call():
    case = next(
        c for c in evals.cases(PL, "gold.json") if any(o["code"] == "subject:FMS" for o in c["options"])
    )
    got = machines.choose(PL, {**case["input"], "label": "FMS"}, case["options"], never)
    assert got.calls == 0 and out(got)["choice"] == ["subject:FMS"] and out(got)["confidence"] == "high"
    char = next(o for o in case["options"] if o["code"].startswith("character:"))
    got = machines.choose(PL, {**case["input"], "label": char["name"]}, case["options"], never)
    assert "a character area" in out(got)["reason"]


def test_skill_link_keeps_one_pick_and_an_answer_with_an_assumption_is_low():
    case = evals.cases(SL, "gold.json", "tune")[0]
    two = [o["code"] for o in case["options"][:2]]
    got = machines.choose(SL, case["input"], case["options"],
                          asker({"choice": two, "reason": "", "confidence": "high", "assumption": ""}))  # fmt: skip
    assert (
        out(got)["choice"] == two[:1] and out(got)["confidence"] == "low" and two[1] in out(got)["assumption"]
    )
    got = machines.choose(SL, case["input"], case["options"],
                          asker({"choice": two[:1], "reason": "", "confidence": "medium", "assumption": "nearest"}))  # fmt: skip
    assert out(got)["confidence"] == "low"


def test_the_subject_default_map_follows_the_tune_gold_where_three_or_more_cases_agree():
    """Orchestrator, 17 Nov: a subject's default changes only where 3 or more tune cases agree on one domain; the
    default then lies in that domain (gold accepts any group of the spine's domain, `choice_in`)."""
    default = next(r["value"] for r in json_rows() if r["key"] == "lo.capability_default")
    by = collections.defaultdict(list)
    for c in tune(CL).values():
        if c["input"]["kind"] == "academic":
            by[c["input"]["subject"]].append(c)
    code = {"Science": "SCI", "Global perspectives": "GP", "Numeracy": "NUM"}
    for subject, cases in by.items():
        domains = {c["choice"][0].split(".")[0] for c in cases}
        if len(cases) >= 3 and len(domains) == 1 and subject in code:
            assert default[code[subject]].split(".")[0] == domains.pop(), subject


def json_rows():
    import json

    return json.loads((settings.SEED / "config.json").read_text())["config"]


@pytest.mark.parametrize(
    "title", ["Introduction to the Celsius scale (°C)", "Reflective symmetry", "Reinforces concepts /"]
)
def test_tune_headings_have_no_verb(title):
    assert rules_choose.verb(title, CL["lists"]["heading_starts"]) is None
    assert rules_choose.verb("Identify properties of 2D shapes", CL["lists"]["heading_starts"]) == "identify"


def test_a_capability_default_code_gave_is_not_on_the_check_first_list():
    """Orchestrator, 17 Nov: code defaults stay off the check-first list; a low answer the model gave stays on it."""

    opts = [{"code": "g.a", "name": "Alpha", "what": "a"}, {"code": "g.b", "name": "Beta", "what": "b"}]
    base = {"grade": "G1", "subject": "Science", "unit": "", "kind": "academic", "domain_default": "g.a"}
    coded = {
        "skill": "capability-link",
        "about": "LO-1",
        "fallback": "g.a",
        "options": opts,
        "inputs": {**base, "objective": "Explore floating and sinking"},
    }
    asked = {**coded, "about": "LO-2", "inputs": {**base, "kind": "character", "objective": "Shares a toy"}}
    low = {"group": "g.a", "confidence": "low", "reason": "r"}
    got = chain_choose.disagreements(
        "capability", [coded, asked], [low, low]
    )
    assert [g["about"] for g in got] == ["LO-2"]
