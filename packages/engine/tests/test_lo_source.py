"""CP-54: what code does to a learning objective's source, and what it shows the checker (engine/skills/lo_source.py).

A model validator is not asked to catch what it is not shown (ADR 0102). A part dropped from a list-type line cannot be
seen in one objective, so code splits the line and nothing is dropped; a repeat of another objective can be seen only
beside that objective, so code shortlists the nearest and shows them. The planted cases of both kinds are held here.
"""

import json
import re

from engine.core import settings, skill_spec
from engine.skills import evals, lo_source, machines, rules

LO = skill_spec.read(settings.SEED / "skills" / "learning-objective")
LISTS = LO["lists"]
CODE_CASES = json.loads((LO["folder"] / "code_cases.json").read_text())["cases"]
NOT_A_LIST = {  # two actions or a list of methods in a sentence, not a labelled list: the standard's own lines hold these
    "LO-G2-0502-P3": "two actions (standard 2: two actions are two objectives)",
    "LO-G3-0957-P3": "a list of methods, which is the condition",
    "LO-G3-0975-P3": "examples in brackets",
}
PASS = {"verdict": "pass", "faults": []}


def test_a_list_type_line_is_one_job_a_part_and_every_planted_dropped_part_case_is_split():
    line = "Grammar & Vocabulary: Command verbs, sequencing words, instructional vocabulary"
    jobs = lo_source.part_inputs({"text": line, "grade": "G2"}, LISTS)
    assert [j["part"] for j in jobs] == [
        "Grammar & Vocabulary: Command verbs",
        "Grammar & Vocabulary: sequencing words",
        "Grammar & Vocabulary: instructional vocabulary",
    ]
    assert all(j["text"] == line and len(j["other_parts"]) == 2 and j["part"] not in j["other_parts"] for j in jobs)
    for c in CODE_CASES:
        found = lo_source.parts(c["input"]["text"], LISTS)
        assert (len(found) > 1) != (c["id"] in NOT_A_LIST), (c["id"], found)


def test_a_line_that_is_not_a_list_is_one_job_and_brackets_and_numbers_are_not_cut():
    for line in (
        "Encourages a love of rhyme.",
        "1.3 Animals in different habitats /",
        "Numbers: read and write numbers to 1,000",
        "Reading: instructions (recipes, party games)",
    ):
        assert lo_source.parts(line, LISTS) == [line], line
        assert lo_source.part_inputs({"text": line}, LISTS) == [{"text": line}]
    several = "* A: x, y / / * B: z / / * C: w"
    assert lo_source.parts(several, LISTS) == ["A: x", "A: y", "B: z", "C: w"]


def test_the_objective_a_planted_repeat_repeats_is_among_the_nearest_the_checker_is_shown():
    repeats = [c for c in evals.cases(LO, "planted_bad_gold.json") if c["fault"].startswith("P4")]
    assert len(repeats) == 10
    for c in repeats:
        repeated = re.search(r"LO-[A-Z0-9]+-M?\d+(-\d+)?", c["fault"]).group(0)
        shown = evals._shown(LO, c, c["output"])
        codes = [n["code"] for n in shown["nearest"]]
        assert repeated in codes and len(codes) <= LISTS["nearest_size"], (c["id"], repeated, codes)
        assert c["id"].removesuffix("-P4") not in codes  # never its own neighbour


def test_nearest_lists_the_closest_first_and_nothing_that_shares_no_word():
    pool = [
        {"code": "A", "text": "The child says a kind word to a friend during circle time."},
        {"code": "B", "text": "The child counts objects to 20."},
        {"code": "C", "text": "The child says a rhyme in circle time."},
    ]
    got = lo_source.nearest("The child says a kind word to the whole group in circle time.", pool, LISTS)
    assert [n["code"] for n in got] == ["A", "C"]


def test_code_refuses_a_near_identical_repeat_naming_the_code_and_the_writer_gets_one_retry():
    inputs = {"grade": "G1", "subject": "English", "topic": "Circle time", "text": "Kind words", "rewrite": True}
    pool = [{"code": "LO-G1-9001", "text": "The child says a kind word to a friend during circle time."}]
    out = {"text": "The child says a kind word to a friend during circle time.", "signal": "Application",
           "source": "school-syllabus", "source_text": "Kind words", "confidence": "low",
           "assumption": "the line names no action; saying a kind word is assumed"}  # fmt: skip
    other = {**out, "text": "The child thanks a friend who helped them, in their own words."}
    asked = []

    def ask(purpose, variables, about):
        asked.append((purpose, variables))
        if purpose.endswith(".validate"):
            return PASS
        return out if len([a for a in asked if not a[0].endswith(".validate")]) == 1 else other

    seen = lambda reply: lo_source.shown(inputs, reply["text"], LISTS, pool=pool)  # noqa: E731
    got = machines.write(LO, inputs, ask, seen=seen)
    assert got.status == "ok" and got.output["text"] == other["text"]
    assert "a repeat of LO-G1-9001" in got.attempts[0]["faults"][0]
    assert "LO-G1-9001" in asked[1][1]["failures"]  # the retry names the objective it repeated
    assert asked[-1][0].endswith(".validate") and "nearest" in asked[-1][1]["inputs"]  # the checker is shown the list
    assert "nearest" not in asked[0][1]["inputs"]  # the writer is given the inputs as they are
    still = machines.write(LO, inputs, lambda p, v, a: out, seen=seen)
    assert still.status == "refused" and "a repeat of LO-G1-9001" in still.faults[0] and still.calls == 2


def test_the_schools_reviewed_objectives_are_not_refused_as_repeats_of_each_other():
    """Code refuses the same words again and nothing looser: the school's distinct objectives that share most words
    ("writes the number 1", "writes the number 2") pass. The seed holds three true doubles (17 Nov), and only those."""
    refused = []
    for grade in ("K2", "G1", "G2", "G3", "G4"):
        pool = [{"code": c, "text": t} for c, t in lo_source.seed_pool(grade)]
        for o in pool:
            near = lo_source.nearest(o["text"], [p for p in pool if p["code"] != o["code"]], LISTS)
            out = {"text": o["text"], "signal": "Procedural", "source": "school-syllabus", "source_text": ""}
            faults = rules.check(LO, {"grade": grade, "nearest": near}, out)
            refused += [o["code"]] if any("a repeat of" in f for f in faults) else []
    assert refused == []


def test_the_marked_twins_join_clean_and_the_dropped_part_cases_have_left_the_validators_set():
    assert len(evals.cases(LO, evals.MARKED)) == 28
    assert not [c for c in evals.cases(LO, "planted_bad_gold.json") if c["fault"].startswith("P3")]
    assert len(CODE_CASES) == 16
    seen = []

    def ask(purpose, variables, about):
        seen.append(about)
        return PASS if purpose.endswith(".validate") else {"_refused": "not asked here"}

    scores = evals.evaluate(LO, ask, split="tune")
    twins = [c["id"] for c in evals.cases(LO, evals.MARKED, "tune")]
    assert set(twins) <= set(seen) and scores["clean"] == 1.0
    assert evals.calls(LO, "tune")["skill.learning-objective.validate"] >= len(twins)
