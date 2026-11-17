"""What code checks about a skill's output, before any validator reads it (CP-54).

Every skill has a function here by its name; the words and lists it reads are the skill's own `lists.json` (data, never
code: CLAUDE.md rule 1). A function returns the faults it found, in words a model can act on, or none. The rules that
are the same for every skill are here once: a choice off its list, a banned word, a word count.
"""

import re
from collections.abc import Callable
from typing import Any

Rule = Callable[
    [dict[str, Any], dict[str, Any], dict[str, Any]], list[str]
]  # (lists, inputs, output) -> faults
Compute = Callable[
    [dict[str, Any], dict[str, Any], dict[str, Any]], dict[str, Any]
]  # (lists, inputs, output) -> output
RULES: dict[str, Rule] = {}
COMPUTED: dict[str, Compute] = {}
WORD = re.compile(r"[A-Za-z0-9'’-]+")


def rule(name: str) -> Callable[[Rule], Rule]:
    def put(fn: Rule) -> Rule:
        RULES[name] = fn
        return fn

    return put


def computes(name: str) -> Callable[[Compute], Compute]:
    """A field code computes, not a model (CLAUDE.md rule 11): set on the output before any rule or reader sees it."""

    def put(fn: Compute) -> Compute:
        COMPUTED[name] = fn
        return fn

    return put


def check(skill: dict[str, Any], inputs: dict[str, Any], output: dict[str, Any]) -> list[str]:
    """The code rules of one skill over one output; a skill with none has only the contract's."""
    fn = RULES.get(skill["name"])
    return fn(skill["lists"], inputs, output) if fn else []


def compute(skill: dict[str, Any], inputs: dict[str, Any], output: dict[str, Any]) -> dict[str, Any]:
    """The output with what code computes put in; a skill that computes nothing gets its output back unchanged."""
    fn = COMPUTED.get(skill["name"])
    return fn(skill["lists"], inputs, output) if fn else output


def choice_faults(skill: dict[str, Any], reply: dict[str, Any], listed: set[str]) -> list[str]:
    """CHOOSE: no more than the standard allows, every code on the list the model was given, none twice."""
    picks = [str(c).strip() for c in reply.get("choice", [])]
    most = int(skill.get("max_choices", 1))
    out = [f"{c!r} is not on the list you were given" for c in picks if c not in listed]
    if len(picks) > most:
        out.append(f"you chose {len(picks)}; the standard allows at most {most}")
    if len(set(picks)) != len(picks):
        out.append("a code is chosen twice")
    if not picks and not skill["lists"].get("none_allowed", True):
        out.append("choosing none is not allowed for this skill: choose the nearest")
    return out


def words(text: str) -> list[str]:
    return WORD.findall(text or "")


def banned(text: str, listed: list[str]) -> list[str]:
    """Each listed word or phrase found in `text` (whole words, any case)."""
    low = (text or "").lower()
    return [b for b in listed if re.search(rf"(?<![a-z]){re.escape(b.lower())}(?![a-z])", low)]


def too_long(text: str, limit: int) -> list[str]:
    n = len(words(text))
    return [f"{n} words; at most {limit}"] if limit and n > limit else []


def one_of(value: Any, allowed: list[str], what: str) -> list[str]:
    return [] if value in allowed else [f"{what} {value!r} is not one of {allowed}"]


def stems(text: str, plain: list[str] | tuple[str, ...] = ()) -> set[str]:
    """The words of `text` that can decide something, each cut to a rough stem (animals, animal; regrouping, regroup):
    words of three letters or more, none of the skill's `plain_words` (the, with, from), lower case."""
    out = set()
    for w in re.findall(r"[a-z]{3,}|\d+", (text or "").lower()):
        if w in plain:
            continue
        for end in ("ing", "ed", "s"):
            if w.endswith(end) and len(w) - len(end) >= 3:
                w = w[: -len(end)]
                break
        out.add(w)
    return out


# each skill's rules register themselves when this is imported
from engine.skills import rules_choose, rules_skills  # noqa: E402, F401
