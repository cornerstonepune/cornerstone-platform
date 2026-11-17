"""Code first for the CHOOSE skills (CP-54, CLAUDE.md rule 11: what code can decide, code decides, not a prompt).

FIRST     before any model is asked: an answer code can give exactly (a label that is an option's own name; an academic
          objective whose verb leaves its domain default alone), or a shorter list (the options of the objective's own
          subject; the groups of the capability the verb points to). `machines.choose` runs it, so the eval scores the
          same path the chain runs.
complete  after the model has picked: the reason names the words of what was given and of the choice, never empty, and a
          pick that is not an exact match says so (confidence low, the assumption written down).

Every word and list this reads is the skill's own `lists.json` or the options code gave (CLAUDE.md rule 1).
"""

import re
from collections.abc import Callable
from typing import Any

from engine.skills.rules import rule, stems

Options = list[dict[str, str]]
Reply = dict[str, Any]
First = Callable[[dict[str, Any], dict[str, Any], Options], tuple[Reply | None, Options]]
Exact = Callable[
    [dict[str, Any], dict[str, Any], Options], bool
]  # (lists, inputs, the options picked) -> exact?
FIRST: dict[str, First] = {}
EXACT: dict[str, Exact] = {}
HEADING = re.compile(
    r"^\s*(?:\d|[^:\s]+(?:\s+[^:\s]+)?\s*:)"
)  # "3.2 Changing shadows", "Title: India", "Key Concepts: …"


def first(skill: dict[str, Any], inputs: dict[str, Any], options: Options) -> tuple[Reply | None, Options]:
    """(code's own answer, or None and the options the model chooses from)."""
    fn = FIRST.get(skill["name"])
    return fn(skill["lists"], inputs, options) if fn else (None, options)


def answer(choice: str, reason: str, assumption: str = "") -> Reply:
    """An answer code gave: sure when it is exact, low with its assumption when it is code's best judgment."""
    return {"choice": [choice], "reason": reason, "confidence": "low" if assumption else "high",
            "assumption": assumption}  # fmt: skip


def verb(text: str) -> str | None:
    """The verb of an objective: the word after "The child", else the first word of a title that is not a heading."""
    m = re.match(r"\s*The child ([A-Za-z-]+)", text or "")
    if m:
        return m.group(1).lower()
    if HEADING.match(text or ""):
        return None
    w = re.match(r"\s*([A-Za-z-]+)", text or "")
    return w.group(1).lower() if w else None


def _shares(lists: dict[str, Any], inputs: dict[str, Any], picked: Options) -> bool:
    """Exact: every pick's own words share a word with what was given."""
    plain = lists.get("plain_words", [])
    given = stems(str(inputs.get(lists["reason_names"], "")), plain)
    return bool(picked) and all(given & stems(f"{o['name']} {o.get('what', '')}", plain) for o in picked)


def _short(text: str, most: int = 12) -> str:
    w = text.split()
    return " ".join(w[:most]) + (" …" if len(w) > most else "")


def complete(skill: dict[str, Any], inputs: dict[str, Any], reply: Reply, options: Options) -> Reply:
    """The reply in the standard's form, computed where code can: a reason that names the words of what was given and of
    the choice (code adds them when the model's reason does not), and an inexact pick marked low with its assumption."""
    lists = skill["lists"]
    key = lists.get("reason_names")
    picked = [o for o in options if o["code"] in reply.get("choice", [])]
    if not key or not picked:
        return reply
    plain = lists.get("plain_words", [])
    given, names = str(inputs.get(key, "")), "; ".join(o["name"] for o in picked)
    reason = str(reply.get("reason") or "").strip()
    said = stems(reason, plain)
    if not (said & stems(given, plain)) or not (said & stems(names, plain)):
        reason = f"{reason} ({key}: {_short(given)!r}; chosen: {_short(names)!r})".strip()
    out = {**reply, "reason": reason}
    if not EXACT.get(skill["name"], _shares)(lists, inputs, picked):
        why = str(reply.get("assumption") or "").strip()
        out |= {"confidence": "low",
                "assumption": why or f"no word of the {key} is in {names!r}: the nearest was chosen"}  # fmt: skip
    return out


# --- capability-link ------------------------------------------------------------------------------------------------


def _capability(code: str) -> str:
    return code.split(".", 1)[0]


def capability_first(
    lists: dict[str, Any], inputs: dict[str, Any], options: Options
) -> tuple[Reply | None, Options]:
    """An academic objective takes its domain default unless its verb is on `verb_groups` (standard 3, 4); a listed verb
    narrows the list to the groups of its capability and the model picks among them. A character objective has no default
    (standard 6), and a default the shortlist does not hold (the spine reaches another capability) is the model's to pick."""
    if inputs.get("kind") == "character":
        return None, options
    v, default = verb(inputs["objective"]), inputs["domain_default"]
    cap = lists.get("verb_groups", {}).get(v or "")
    if cap:
        return None, [o for o in options if _capability(o["code"]) == cap] or options
    if default not in {o["code"] for o in options}:
        return None, options
    group = next(o["name"] for o in options if o["code"] == default)
    if v is None:
        return answer(default, f"{_short(inputs['objective'])!r} names no verb of doing: the domain default {group!r}",
                      "a heading, not an objective: its subject's default group until it is rewritten"), options  # fmt: skip
    return answer(default, f"the verb {v!r} does not leave the domain: the domain default {group!r}"), options


def capability_exact(lists: dict[str, Any], inputs: dict[str, Any], picked: Options) -> bool:
    cap = lists.get("verb_groups", {}).get(verb(inputs["objective"]) or "")
    return bool(cap) and all(_capability(o["code"]) == cap for o in picked)


# --- placement --------------------------------------------------------------------------------------------------------


def _name(text: str, plain: list[str]) -> str:
    return " ".join(sorted(stems(text, plain)))


def placement_first(
    lists: dict[str, Any], inputs: dict[str, Any], options: Options
) -> tuple[Reply | None, Options]:
    """A label that is the very name of a subject, a routine or a character area on the list is that place (standard 2,
    4, 5); a part of a subject is never its name, so a part is the model's to choose."""
    plain = lists.get("plain_words", [])
    label = _name(inputs["label"], plain)
    exact = [
        o
        for o in options
        if o["code"].split(":", 1)[0] in lists["named_kinds"] and _name(o["name"], plain) == label
    ]
    if label and len(exact) == 1:
        o = exact[0]
        return answer(o["code"], f"the label {inputs['label']!r} is the name of {o['name']!r}, a {o['code'].split(':')[0]}"
                      ), options  # fmt: skip
    return None, options


@rule("placement")
def placement(lists: dict[str, Any], inputs: dict[str, Any], out: dict[str, Any]) -> list[str]:
    """Four kinds only (standard 1): a choice is a subject, a routine, a part of a subject or a character area."""
    kinds = lists["kinds"]
    return [
        f"{c!r} is not one of the four kinds {kinds}"
        for c in out.get("choice", [])
        if c.split(":", 1)[0] not in kinds
    ]


# --- skill-link -------------------------------------------------------------------------------------------------------


def skill_link_first(
    lists: dict[str, Any], inputs: dict[str, Any], options: Options
) -> tuple[Reply | None, Options]:
    """Stay in the subject (standard 4): where the options say their subject, only the objective's own subject's are
    offered; none of its subject on the list leaves the list as it was, so nothing is left empty."""
    mine = inputs.get("subject_code")
    same = [o for o in options if mine and o.get("subject_code") == mine]
    return None, same or options


FIRST.update(
    {"capability-link": capability_first, "placement": placement_first, "skill-link": skill_link_first}
)
EXACT.update({"capability-link": capability_exact})
