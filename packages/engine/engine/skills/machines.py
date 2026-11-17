"""The two machines every skill runs on (CP-54, Nimish 16 Nov: one skill makes each kind of curriculum artefact, never a
prompt per grade or subject).

WRITE   a model drafts what the skill's standard asks, code checks it (`rules`), a validator reads it, and one retry names
        every failure. What still fails is refused and kept with its faults, for a person.
CHOOSE  code makes the list, a model picks from it or says none, code refuses a pick that is not on the list.

A model's number is never its last word: the rules compute what code can, and a reply off the contract's schema is a
refusal, not a guess. Calls go through `llm.generate`, so every one leaves a `flow_run` row with its cost, and the
campaign's cap (config `llm.campaigns`) stops them. The grade and the subject are inputs.
"""

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

import jsonschema

from engine.core import db, settings, skill_spec
from engine.skills import rules, rules_choose

Ask = Callable[[str, dict[str, Any], str], dict[str, Any]]  # (purpose, variables, what it is about) -> reply
RETRIES = 1  # one retry, naming the failures (the brief); never a loop


class SkillRefusal(Exception):
    """What was given does not meet the skill's contract, or a reply could not be read: nothing is spent or written."""


@dataclass
class Outcome:
    status: str  # ok · none (a choice of nothing, which is an answer) · refused
    output: dict[str, Any] | None = None
    faults: list[str] = field(default_factory=list)
    calls: int = 0
    attempts: list[dict[str, Any]] = field(
        default_factory=list
    )  # every output tried, with its faults: kept for a person


def _check_input(skill: dict[str, Any], inputs: dict[str, Any]) -> None:
    try:
        jsonschema.validate(inputs, skill["contract"]["input"])
    except jsonschema.ValidationError as e:
        raise SkillRefusal(f"{skill['name']}: input is off its contract: {e.message}") from e


def model_ask(conn: db.Conn, version: int | None = None, stage: str | None = None) -> Ask:
    """The asker that calls the model through the adapter. A reply off its schema comes back as {"_refused": why}."""
    from engine.adapters import llm  # the one outside service, named only here

    def ask(purpose: str, variables: dict[str, Any], about: str) -> dict[str, Any]:
        school = {
            "school": settings.config(conn, "school.context") or "(not given)"
        }  # a row, read at every call
        try:
            return llm.generate(
                conn, purpose, {**school, **variables}, version=version, stage=stage, about=about
            )
        except llm.LLMSchemaError as e:
            return {"_refused": str(e)}

    return ask


def validate(skill: dict[str, Any], inputs: dict[str, Any], output: dict[str, Any], ask: Ask, about: str,
              options: str = "", reference: Any = None) -> list[str]:  # fmt: skip
    """The second reader. `reference` is the school's own piece of work for the same input, shown only to the validator
    (never to the writer): the work must be close to it in nature."""
    reply = ask(
        skill_spec.purpose(skill["name"], True),
        {
            "inputs": inputs,
            "output": output,
            "options": options or "(none: this skill writes)",
            "reference": reference or "(none given)",
        },
        about,
    )
    if "_refused" in reply:
        return [f"the validator's reply could not be read: {reply['_refused']}"]
    return [f"{f['rule']}: {f['why']}" for f in reply["faults"]] if reply["verdict"] == "fail" else []


def write(
    skill: dict[str, Any], inputs: dict[str, Any], ask: Ask, about: str = "", reference: Any = None
) -> Outcome:
    """WRITE: draft, check by code, validate, retry once naming every failure."""
    _check_input(skill, inputs)
    out, failures = Outcome("refused"), "none (a first attempt)"
    for attempt in range(RETRIES + 1):
        reply = ask(skill_spec.purpose(skill["name"]), {"inputs": inputs, "failures": failures}, about)
        out.calls += 1
        if "_refused" in reply:
            faults = [f"the reply was off its schema: {reply['_refused']}"]
            out.attempts.append({"output": None, "faults": faults})
        else:
            try:
                jsonschema.validate(reply, skill["contract"]["output"])
                reply = rules.compute(skill, inputs, reply)  # what code computes is never the model's to say
                faults = rules.check(skill, inputs, reply)
            except jsonschema.ValidationError as e:
                faults = [f"the reply is off its contract: {e.message}"]
            if not faults:  # the validator reads only what code has passed
                faults = validate(skill, inputs, reply, ask, about, reference=reference)
                out.calls += 1
            out.attempts.append({"output": reply, "faults": faults})
        if not faults:
            return Outcome("ok", reply, [], out.calls, out.attempts)
        failures = "\n".join(f"- {f}" for f in faults)
        out.faults = faults
    out.output = out.attempts[-1]["output"]
    return out


def choose(skill: dict[str, Any], inputs: dict[str, Any], options: list[dict[str, str]], ask: Ask,
           about: str = "", second_reader: bool = False) -> Outcome:  # fmt: skip
    """CHOOSE: code answers first where it can (`rules_choose.first`), with no call; otherwise the model picks from
    `options` ({code, name, what}), the list code may have shortened, or none; a pick off the list is refused by code,
    and the reply's reason and confidence are put in the standard's form (`rules_choose.complete`)."""
    _check_input(skill, inputs)
    decided, options = rules_choose.first(skill, inputs, options)
    if decided is not None:
        return Outcome("ok", decided, calls=0)
    if not options:
        return Outcome("none", {"choice": [], "reason": "code found nothing to choose from"})
    listing = "\n".join(f"{o['code']} | {o['name']} | {o.get('what', '')}" for o in options)
    reply = ask(skill_spec.purpose(skill["name"]), {"inputs": inputs, "options": listing}, about)
    out = Outcome("refused", calls=1)
    if "_refused" in reply:
        out.faults = [f"the reply was off its schema: {reply['_refused']}"]
        return out
    faults = rules.choice_faults(skill, reply, {o["code"] for o in options})
    if not faults:
        reply = rules_choose.complete(skill, inputs, reply, options)
        faults = rules.check(skill, inputs, reply)
    out.output = reply
    if faults:
        out.faults = faults
        return out
    if second_reader:
        out.faults = validate(skill, inputs, reply, ask, about, listing)
        out.calls += 1
        if out.faults:
            return out
    out.status = "ok" if reply["choice"] else "none"
    return out
