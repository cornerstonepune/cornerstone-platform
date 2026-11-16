"""The code rules of the ten skills (CP-54): what code can check, so the validator is left only what needs reading.

One function per skill, registered under its name (`rules.rule`). The words each reads come from the skill's own
`lists.json`, never from here (CLAUDE.md rule 1). A rule returns the faults it finds, each a sentence a model can act on.
"""

import re
from typing import Any

from engine.skills.rules import banned, one_of, rule, too_long

Lists = dict[str, Any]
Data = dict[str, Any]
SIGNALS = [
    "Foundational",
    "Conceptual",
    "Procedural",
    "Application",
    "Stretch",
]  # the school's five (CLAUDE.md)


def _norm(text: str) -> str:
    return " ".join(re.sub(r"[^a-z0-9 ]", " ", (text or "").lower()).split())


def _same(a: str, b: str) -> float:
    x, y = set(_norm(a).split()), set(_norm(b).split())
    return len(x & y) / len(x | y) if x | y else 0.0


def _child_sentence(text: str, lists: Lists) -> list[str]:
    """ "The child" then one verb that can be seen or heard: one the school lists, or any other that is not ruled out
    (a verb of being or having, or a word the school never uses), and none of the banned words anywhere."""
    out: list[str] = []
    m = re.match(r"The child (\w+)", (text or "").strip())
    if not m:
        return ['it must begin "The child" and then one verb']
    verb = m.group(1).lower()
    known = verb in lists["verbs"]
    other = (
        verb.endswith("s") and verb not in lists.get("not_actions", []) and not banned(verb, lists["banned"])
    )
    if not (known or other):
        out.append(f"{m.group(1)!r} is not a verb of something a child does that can be seen or heard")
    out += [f"uses {b!r}, which is never used" for b in banned(text, lists["banned"])]
    return out


@rule("learning-objective")
def learning_objective(lists: Lists, inputs: Data, out: Data) -> list[str]:
    text = out["text"]
    faults = _child_sentence(text, lists) + too_long(text, int(lists["max_words"]))
    seconds = re.findall(r"(?:,| and| then| or)\s+(\w+)", text)
    if any(s.lower() in lists["verbs"] for s in seconds):
        faults.append("two actions: it asks for more than one thing a child does; one action only")
    examples = bool(
        re.search(r"such as|for example|e\.g\.", text)
    )  # an example list is not a list of things to do
    if len(re.findall(r",", text)) > int(lists["max_commas"]) + (
        int(lists.get("example_commas", 0)) if examples else 0
    ):
        faults.append("a list: more than one comma; one action only, no list")
    faults += one_of(out["signal"], SIGNALS, "signal")
    given = {s["code"] for s in inputs.get("statements", [])} | {
        f"sibling:{c}" for c in inputs.get("sibling_codes", [])
    }
    allowed = given | set(lists["named_sources"])
    if out["source"] not in allowed:
        faults.append(f"source {out['source']!r} is not one of the sources you were given: {sorted(allowed)}")
    if inputs.get("rewrite") and out["source_text"] != inputs["text"]:
        faults.append("a rewrite keeps the original wording, unchanged, as source_text")
    for sib in inputs.get("siblings", []):
        if _same(text, sib) >= float(lists["too_alike"]):
            faults.append(f"almost the same as a sibling objective: {sib!r}")
    return faults


@rule("topic")
def topic(lists: Lists, inputs: Data, out: Data) -> list[str]:
    name = out["topic"].strip()
    faults = too_long(name, int(lists["max_words"]))
    if not name or name.split()[0].lower() in lists["not_first"]:
        faults.append("a topic is a noun phrase: it does not begin with a verb or a question word")
    faults += [
        f"{b!r} makes it a book, a unit or an activity, not a topic"
        for b in banned(name, lists["not_a_topic"])
    ]
    if re.search(r"\d", name):
        faults.append("a topic has no number in it (no unit number, no book number)")
    existing = {t["code"]: t["name"] for t in inputs.get("existing_topics", [])}
    if out.get("reuse") and out["reuse"] not in existing:
        faults.append(f"reuse {out['reuse']!r} is not an existing topic of this subject")
    if not out.get("reuse") and any(_norm(n) == _norm(name) for n in existing.values()):
        faults.append(
            "this topic already exists under the same name: reuse it, so the name is the same across grades"
        )
    return faults


@rule("behaviour")
def behaviour(lists: Lists, inputs: Data, out: Data) -> list[str]:
    text, near = out["text"], out["near_miss"]
    faults = _child_sentence(text, lists)
    for field, what in ((text, "the behaviour"), (near, "the near-miss")):
        faults += [
            f"{what} uses {b!r}: not a child's own act on one occasion"
            for b in banned(field, lists["not_allowed"])
        ]
        faults += [
            f"{what} describes a habit ({b!r}), not one occasion" for b in banned(field, lists["habit"])
        ]
        caps = [w for w in re.findall(r"(?<=[a-z,;] )[A-Z][a-z]+", field) if w not in lists["allowed_caps"]]
        faults += [f"{what} has a capitalised word {c!r}: no other child's name" for c in caps]
    if not near.strip():
        faults.append(
            "a near-miss is needed: what it looks like when the child is nearly there, never a bad child"
        )
    return faults + one_of(out["stage"], inputs["stages"], "stage")


@rule("activity")
def activity(lists: Lists, inputs: Data, out: Data) -> list[str]:
    faults = one_of(out["format"], inputs["formats"], "format")
    if out["core_lo"] != inputs["lo"]["code"]:
        faults.append("core_lo must be the one learning objective you were given")
    given = {c["code"] for c in inputs.get("character_los", [])}
    extra = [c for c in out["character_los"] if c not in given]
    if extra or len(out["character_los"]) > int(lists["max_character_los"]):
        faults.append(
            f"character_los must come from those given and be at most {lists['max_character_los']}: {extra}"
        )
    faults += one_of(out["grouping"], lists["groupings"], "grouping")
    if not 1 <= out["minutes"] <= int(inputs["minutes_max"]):
        faults.append(f"minutes {out['minutes']} is outside 1 to {inputs['minutes_max']}")
    if not out["steps"] or not out["watch_for"]:
        faults.append("a lesson needs its steps and what the educator watches for")
    shelf = set(inputs["catalogue"])
    faults += [f"material {m!r} is not in the catalogue" for m in out["materials"] if m not in shelf]
    if not inputs.get("screens_allowed", True):
        blob = " ".join([out["title"], *out["steps"], *out["materials"]])
        faults += [f"uses {b!r}: this grade has no screens" for b in banned(blob, lists["screens"])]
    return faults


@rule("rubric")
def rubric(lists: Lists, inputs: Data, out: Data) -> list[str]:
    los = inputs["los"]
    faults: list[str] = []
    if [r["lo_code"] for r in out["rows"]] != [lo["code"] for lo in los]:
        return ["one row for each learning objective, in the order given, and no other"]
    for row, lo in zip(out["rows"], los, strict=True):
        lv = row["levels"]
        wanted = _norm(re.sub(r"^The child ", "", lo["text"]))
        if wanted not in _norm(lv["2"]):
            faults.append(f"{lo['code']}: level 2 must be the objective as written")
        if not banned(lv["1"], lists["support"]):
            faults.append(f"{lo['code']}: level 1 is with support: say what support")
        if not banned(lv["0"], lists["not_yet"]):
            faults.append(f'{lo["code"]}: level 0 is "not yet": say what is not yet seen')
        for n in "0123":
            faults += [
                f"{lo['code']} level {n}: {b!r} labels the child; describe what is seen"
                for b in banned(lv[n], lists["labels"])
            ]
        if len({_norm(lv[n]) for n in "0123"}) < 4:
            faults.append(f"{lo['code']}: four levels, four different descriptions")
    return faults


@rule("materials")
def materials(lists: Lists, inputs: Data, out: Data) -> list[str]:
    faults: list[str] = []
    shelf = {c["name"] for c in inputs["catalogue"]}
    seen: set[str] = set()
    for ln in out["lines"]:
        if ln["item"] not in shelf:
            faults.append(f"{ln['item']!r} is not a name in the catalogue")
        if ln["item"] in seen:
            faults.append(f"{ln['item']!r} is on two lines: one line for each item")
        seen.add(ln["item"])
        faults += one_of(ln["per"], lists["per"], "per") + one_of(ln["kind"], lists["kinds"], "kind")
        if ln["quantity"] <= 0:
            faults.append(f"{ln['item']!r}: the quantity must be more than 0")
    return faults


@rule("question")
def question(lists: Lists, inputs: Data, out: Data) -> list[str]:
    faults = one_of(inputs["difficulty"], lists["difficulties"], "difficulty")
    right = [o for o in out["options"] if o["correct"]]
    if len(right) != 1 or right[0]["text"].strip() != str(inputs["answer"]).strip():
        faults.append("exactly one option is correct, and it is the answer code computed, unchanged")
    known = {m["code"] for m in inputs["misconceptions"]}
    for o in out["options"]:
        if not o["correct"] and o["misconception"] not in known:
            faults.append(f"wrong option {o['text']!r} must name one of the misconceptions you were given")
    if len({o["text"].strip() for o in out["options"]}) != len(out["options"]):
        faults.append("two options are the same")
    if not out["working_space"]:
        faults.append("leave space for working, so blank, wrong and wrong-with-working stay three signals")
    limit = int(lists["max_words"].get(inputs["grade"], lists["max_words"]["default"]))
    faults += too_long(out["stem"], limit)
    faults += [f"uses {b!r}, which is never used" for b in banned(out["stem"], lists["banned"])]
    return faults
