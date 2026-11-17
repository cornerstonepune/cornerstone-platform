"""Code first for the CHOOSE skills (CP-54, CLAUDE.md rule 11: what code can decide, code decides, not a prompt).

FIRST     before any model is asked: an answer code can give exactly (a label that is an option's own name; a heading
          with no verb, and an academic objective while capability-link's `lists.json` says "academic": "default", gets
          its subject default, marked low), or a shorter list (the options of the objective's own subject).
          `machines.choose` runs it, so the eval scores the same path the chain runs.
AFTER     a skill's own rule on the model's pick: capability-link may leave the domain default only with a reason that
          names the objective's verb and the chosen group's words; otherwise the default stands, low.
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
    [dict[str, Any], dict[str, Any], Options, Options], bool
]  # (lists, inputs, the options picked, the options given) -> exact?
After = Callable[
    [dict[str, Any], dict[str, Any], dict[str, Any], Options], dict[str, Any]
]  # (lists, inputs, reply, options)
FIRST: dict[str, First] = {}
EXACT: dict[str, Exact] = {}
AFTER: dict[str, After] = {}  # a skill's own rule on the model's reply, before the reason is put in form
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


def _shares(lists: dict[str, Any], inputs: dict[str, Any], picked: Options, options: Options) -> bool:
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
    if skill["name"] in AFTER:
        reply = AFTER[skill["name"]](lists, inputs, reply, options)
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
    if not EXACT.get(skill["name"], _shares)(lists, inputs, picked, options):
        why = str(reply.get("assumption") or "").strip()
        out |= {"confidence": "low",
                "assumption": why or f"no word of the {key} is in {names!r}: the nearest was chosen"}  # fmt: skip
    return out


# --- capability-link ------------------------------------------------------------------------------------------------


def has_default(inputs: dict[str, Any], options: Options) -> bool:
    """An objective that is not character (academic or routine) whose domain default is on the list: the default is the
    starting answer (standard 3)."""
    return inputs.get("kind") != "character" and inputs.get("domain_default") in {o["code"] for o in options}


ACADEMIC = ("default", "ask")  # the values capability-link's `lists.json` key "academic" may take


def capability_first(
    lists: dict[str, Any], inputs: dict[str, Any], options: Options
) -> tuple[Reply | None, Options]:
    """Code answers, with no call, an objective whose default is on the list when it is a heading with no verb of doing,
    or an academic objective while the skill's `lists.json` says "academic": "default" (orchestrator, 17 Nov: the model
    left the default 4 times on the tune half and was right 0 times). Both get the subject default, marked low with its
    assumption. A character or routine objective, a default not on the list, and every objective under "ask" are the
    model's, which starts from the domain default given in its input (standard 3)."""
    mode = lists.get("academic", "ask")
    if mode not in ACADEMIC:
        raise ValueError(f"capability-link lists.json: 'academic' is one of {ACADEMIC}, not {mode!r}")
    default = inputs["domain_default"]
    if not has_default(inputs, options):
        return None, options
    group = next(o["name"] for o in options if o["code"] == default)
    if verb(inputs["objective"]) is None:
        return answer(default, f"{_short(inputs['objective'])!r} names no verb of doing: the domain default {group!r}",
                      "a heading, not an objective: its subject's default group until it is rewritten"), options  # fmt: skip
    if mode == "default" and inputs.get("kind", "academic") == "academic":
        return answer(default, f"{_short(inputs['objective'])!r} is {inputs['subject']} learning: the subject default"
                      f" {group!r}", "the subject default: an academic objective counts toward its subject's group"
                      " until an educator changes it"), options  # fmt: skip
    return None, options


def capability_after(lists: dict[str, Any], inputs: dict[str, Any], reply: Reply, options: Options) -> Reply:
    """Leaving the default needs a clear reason (standard 4): the model's own reason names the objective's verb and words of
    the group it chose. A reason that does not is no reason: the default stands, low, with the assumption written (CHOOSE
    has no retry)."""
    default = inputs["domain_default"]
    if not has_default(inputs, options) or reply.get("choice") == [default]:
        return reply
    plain = lists.get("plain_words", [])
    v = verb(inputs["objective"]) or ""
    said = stems(str(reply.get("reason") or ""), plain)
    picked = [o for o in options if o["code"] in reply.get("choice", [])]
    group = stems(" ".join(f"{o['name']} {o.get('what', '')}" for o in picked), plain)
    if said & stems(v) and said & group:
        return reply
    name = next(o["name"] for o in options if o["code"] == default)
    chose = "; ".join(o["name"] for o in picked)
    return answer(default, f"the reason for leaving {name!r} for {chose!r} did not name both the verb {v!r} and the"
                  f" group's words: the domain default {name!r} stands",
                  f"the model left the default without naming the verb {v!r} and the group's words; a person checks it"
                  )  # fmt: skip


def capability_exact(
    lists: dict[str, Any], inputs: dict[str, Any], picked: Options, options: Options
) -> bool:
    """The default, or a leaving `capability_after` kept, is the standard applied; with no default, words decide."""
    return has_default(inputs, options) or _shares(lists, inputs, picked, options)


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
AFTER.update({"capability-link": capability_after})
