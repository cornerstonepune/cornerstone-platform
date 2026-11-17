"""CP-54 code fixes (handover "Failure categories", step 1): what code decides about the four scored skills, so neither the
writer, the chooser nor the validator is asked it (CLAUDE.md rule 11). No model is called: a made-up asker answers, and one
that is not to be asked raises. The lists code reads are built from the TUNE half of the gold only; the tests below rebuild
them from the tune half and hold the files to that recipe, so a held answer can never shape them."""

import collections
import re

import pytest

from engine.core import settings, skill_spec
from engine.skills import evals, machines, rules, rules_choose

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


# --- D. capability link: the domain default unless the verb is listed ------------------------------------------------

CL_CASE = tune(CL)["LO-G1-0081"]  # "Understanding events that are certain …": the default is a right answer


def test_the_verb_groups_list_is_built_from_the_tune_half_only():
    """The recipe: a verb whose tune cases number 2 or more, never keep the default, and all reach one capability."""
    by = collections.defaultdict(list)
    for c in evals.cases(CL, "gold.json", "tune"):
        v = rules_choose.verb(c["input"]["objective"])
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


def test_an_academic_objective_takes_its_domain_default_with_no_model_call():
    got = machines.choose(CL, CL_CASE["input"], CL_CASE["options"], never)
    assert (got.status, got.calls, out(got)["choice"]) == ("ok", 0, [CL_CASE["input"]["domain_default"]])
    assert "understanding" in out(got)["reason"] and out(got)["confidence"] == "high"


def test_a_heading_with_no_verb_takes_the_default_marked_low_with_its_assumption():
    given = {**CL_CASE["input"], "objective": "Title: India on the Globe"}
    got = machines.choose(CL, given, CL_CASE["options"], never)
    assert out(got)["choice"] == [given["domain_default"]]
    assert out(got)["confidence"] == "low" and out(got)["assumption"]


def test_the_eval_scores_the_code_path():
    """The gold score goes through the same machine: a case code decides is right with no model call."""
    assert evals._gold_right(CL, CL_CASE, never)


@pytest.mark.parametrize(
    "change",
    [
        {"kind": "character"},  # a character objective has no default (standard 6)
        {"domain_default": "not-on-the-list"},  # the spine reaches another capability
    ],
)
def test_the_model_picks_when_code_cannot_decide(change):
    pick = CL_CASE["options"][0]["code"]
    ask = asker({"choice": [pick], "reason": "", "confidence": "high", "assumption": ""})
    got = machines.choose(CL, {**CL_CASE["input"], **change}, CL_CASE["options"], ask)
    assert got.calls == 1 and out(got)["choice"] == [pick]


def test_a_listed_verb_narrows_the_list_to_its_capability_and_the_model_picks_there():
    skill = {**CL, "lists": {**CL["lists"], "verb_groups": {"investigates": "v2-making-and-solving"}}}
    given = {**CL_CASE["input"], "objective": "The child investigates which ball bounces highest."}
    pick = "v2-making-and-solving.investigate"
    ask = asker(
        {"choice": [pick], "reason": "investigates: Investigating", "confidence": "high", "assumption": ""}
    )
    got = machines.choose(skill, given, CL_CASE["options"], ask)
    listed = ask.asked[0][1]["options"]
    assert all(line.startswith("v2-making-and-solving.") for line in listed.splitlines())
    assert got.status == "ok" and out(got)["choice"] == [pick] and out(got)["confidence"] == "high"


def test_a_capability_pick_off_the_verbs_capability_is_marked_low_and_its_reason_is_never_empty():
    pick = "v2-reasoning.weigh-evidence"
    ask = asker({"choice": [pick], "reason": "", "confidence": "high", "assumption": ""})
    got = machines.choose(CL, {**CL_CASE["input"], "kind": "character"}, CL_CASE["options"], ask)
    o = out(got)
    assert o["reason"] and "Weighing evidence" in o["reason"] and "Understanding" in o["reason"]
    assert o["confidence"] == "low" and o["assumption"]


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


def test_a_label_that_is_no_places_name_goes_to_the_model_and_an_inexact_pick_is_marked_low():
    case = tune(PL)["K2-Rhymes & Songs"]
    ask = asker({"choice": ["part:ENG"], "reason": "", "confidence": "high", "assumption": ""})
    got = machines.choose(PL, case["input"], case["options"], ask)
    o = out(got)
    assert got.calls == 1 and o["choice"] == ["part:ENG"]
    assert "Rhymes & Songs" in o["reason"] and "English" in o["reason"]
    assert o["confidence"] == "low" and o["assumption"]


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
