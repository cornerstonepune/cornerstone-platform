"""What `engine skill eval <name>` measures (CP-54 B2). Four tests make a skill "used across the board", few and fast:

gold      agreement with the gold cases (`gold.json`): a WRITE skill's answer passes every code rule and the validator and
          matches what the case expects; a CHOOSE skill picks what the case's coordinator picked
clean     the validator passes the gold cases' good answers (a validator that fails everything is no use)
catch     the validator fails the planted-bad answers (`planted_bad_gold.json`): a validator that passes everything fails here
smoke     the skill, run on three grades by two subjects (`smoke.json`), makes an answer that passes
not_worse the skill's gold score is at least the score the prompt it replaces was made active on (`replaces`)

The scores are held to the skill's bars, rows `skill_bar.<name>.*` (checks/bars.py), set before the run. Maya and
Akanksha add their own cases to `gold_coordinators.json` beside the gold, in the same form; both files are read.
"""

import json
from typing import Any

from engine.core import settings, skill_spec
from engine.skills import machines

MEASURES = ("gold", "clean", "catch", "smoke", "not_worse")


def cases(skill: dict[str, Any], name: str, split: str = "all") -> list[dict[str, Any]]:
    """The cases of a file in the skill's folder, and for gold the coordinators' file beside it. A case may say
    `split`: tune (a skill's prompt is tuned on these) or held (only these score it): `split` picks one half; a case that
    says none is a tune case."""
    files = [name, "gold_coordinators.json"] if name == "gold.json" else [name]
    out: list[dict[str, Any]] = []
    for f in files:
        path = skill["folder"] / f
        if path.exists():
            out += json.loads(path.read_text())["cases"]
    return out if split == "all" else [c for c in out if c.get("split", "tune") == split]


def _options(skill: dict[str, Any], case: dict[str, Any]) -> list[dict[str, str]]:
    return case.get("options", []) if skill["mode"] == "choose" else []


def _listing(options: list[dict[str, str]]) -> str:
    return "\n".join(f"{o['code']} | {o['name']} | {o.get('what', '')}" for o in options)


def _agrees(choice: list[str], case: dict[str, Any]) -> bool:
    """The coordinator's choice exactly, or, where the fact is only that the answer is one of several (`choice_in`: every
    group of the one capability the spine reaches, every objective the registry links to the skill), any answer inside it."""
    if "choice_in" in case:
        return bool(choice) and set(choice) <= set(case["choice_in"])
    return sorted(choice) == sorted(case["choice"])


def _gold_right(skill: dict[str, Any], case: dict[str, Any], ask: machines.Ask) -> bool:
    if skill["mode"] == "choose":
        got = machines.choose(skill, case["input"], case["options"], ask, about=case["id"])
        return got.output is not None and not got.faults and _agrees(got.output["choice"], case)
    got = machines.write(skill, case["input"], ask, about=case["id"])
    return got.status == "ok" and all(
        (got.output or {}).get(k) == v for k, v in case.get("expect", {}).items()
    )


def _has_good(skill: dict[str, Any], case: dict[str, Any]) -> bool:
    return "choice" in case if skill["mode"] == "choose" else "good" in case


def _good(skill: dict[str, Any], case: dict[str, Any]) -> dict[str, Any]:
    return (
        {
            "choice": case["choice"],
            "reason": "the coordinator's choice",
            "confidence": "high",
            "assumption": "",
        }
        if skill["mode"] == "choose"
        else case["good"]
    )


def evaluate(
    skill: dict[str, Any], ask: machines.Ask, conn: Any = None, split: str = "all"
) -> dict[str, float]:
    """Every measure for one skill, from its folder's cases, asking the model through `ask`."""
    gold = cases(skill, "gold.json", split)
    planted, smoke = cases(skill, "planted_bad_gold.json", split), cases(skill, "smoke.json", split)
    right = sum(_gold_right(skill, c, ask) for c in gold)
    known = [
        c for c in gold if _has_good(skill, c)
    ]  # a case with no answer of its own is scored by `gold` only
    clean = sum(
        not machines.validate(skill, c["input"], _good(skill, c), ask, c["id"], _listing(_options(skill, c)))
        for c in known
    )
    caught = sum(
        bool(machines.validate(skill, c["input"], c["output"], ask, c["id"], _listing(_options(skill, c))))
        for c in planted
    )
    ran = [
        machines.choose(skill, c["input"], c["options"], ask, c["id"])
        if skill["mode"] == "choose"
        else machines.write(skill, c["input"], ask, c["id"])
        for c in smoke
    ]
    scores = {
        "gold": right / len(gold) if gold else 0.0,
        "clean": clean / len(known) if known else 0.0,
        "catch": caught / len(planted) if planted else 0.0,
        "smoke": sum(o.status in ("ok", "none") and not o.faults for o in ran) / len(smoke) if smoke else 0.0,
    }
    scores["not_worse"] = not_worse(conn, skill, scores["gold"]) if conn is not None else 1.0
    return scores


def not_worse(conn: Any, skill: dict[str, Any], gold: float) -> float:
    """1 when the skill's gold score is at least the score of the prompt it replaces, as that prompt's own bar recorded it
    (`replaces.eval` in the front matter: {purpose, measure}); 1 for a skill that replaces nothing."""
    old = (skill.get("replaces") or {}).get("eval")
    if not old:
        return 1.0
    was = settings.threshold(conn, f"eval.{old['purpose']}.{old['measure']}", 0.0)
    return float(gold >= was)


def calls(skill: dict[str, Any], split: str = "all") -> dict[str, int]:
    """The model calls one eval makes, by purpose: no call is made to count them."""
    gold, planted, smoke = (
        len(cases(skill, "gold.json", split)),
        len(cases(skill, "planted_bad_gold.json", split)),
        len(cases(skill, "smoke.json", split)),
    )
    maker, check = skill_spec.purpose(skill["name"]), skill_spec.purpose(skill["name"], True)
    write = skill["mode"] == "write"
    # a WRITE attempt is a draft and, when code passes it, a validation; a retry doubles the worst case
    return {
        maker: (gold + smoke) * (2 if write else 1),
        check: len([c for c in cases(skill, "gold.json", split) if _has_good(skill, c)])
        + gold
        + planted
        + (smoke * 2 if write else 0),
    }
