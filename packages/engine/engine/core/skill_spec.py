"""A skill is a folder (CP-54): `supabase/seed/skills/<name>/`, and the loader turns it into two prompt rows.

    SKILL.md        the standard, written for people; its front matter says the mode, the models and what it replaces
    contract.json   {"input": a JSON schema, "output": a JSON schema}: what the skill is given and what it gives back
    lists.json      the words and lists the code checks read (banned words, verbs, formats): data, never code
    gold.json       cases the skill's answers are scored against, and `planted_bad_gold.json` for its validator (see skills/evals)
    smoke.json      inputs across three grades and two subjects

Two machines only (engine/skills/machines.py): WRITE (a model drafts, code checks, a validator reads, one retry that names
the failures) and CHOOSE (code shortlists, a model picks or says none, code refuses an answer off the list). The prompts
are rows (CLAUDE.md rule 2): `skill.<name>` is the generator and `skill.<name>.validate` the validator, made here from
the standard and the frame in `skills/_frame/`, so the standard is written once and both read it. The model of each
is the front matter's: a writer is Sonnet-class, a chooser Haiku, and the validator the stronger model (6 Nov: Sonnet
missed 9 faults Opus caught on 55 pages). Grade and subject are inputs, never a skill's name.
A skill's rows are active only when its SKILL.md says so, which is written only after its eval is recorded (rule 7).
"""

import json
import re
from pathlib import Path
from typing import Any

import yaml

from engine.core import db

MODES = ("write", "choose")
FRONT = re.compile(r"\A---\n(.*?)\n---\n(.*)\Z", re.S)
VALIDATOR_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["verdict", "faults"],
    "properties": {
        "verdict": {"enum": ["pass", "fail"]},
        "faults": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["rule", "why"],
                "properties": {"rule": {"type": "string"}, "why": {"type": "string"}},
            },
        },
    },
}
CHOICE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["choice", "reason", "confidence", "assumption"],
    "properties": {
        "choice": {"type": "array", "items": {"type": "string"}},
        "reason": {"type": "string"},
        "confidence": {"enum": ["high", "medium", "low"]},
        "assumption": {"type": "string"},
    },
}


class SkillError(Exception):
    """A skill folder that does not meet the frame."""


def purpose(name: str, validator: bool = False) -> str:
    return f"skill.{name}" + (".validate" if validator else "")


def folders(root: Path) -> list[Path]:
    return (
        sorted(p for p in root.iterdir() if p.is_dir() and not p.name.startswith("_"))
        if root.exists()
        else []
    )


def read(folder: Path) -> dict[str, Any]:
    """One skill folder as a dict: its front matter, its standard, its contract and its lists."""
    m = FRONT.match((folder / "SKILL.md").read_text())
    if not m:
        raise SkillError(f"{folder.name}/SKILL.md has no front matter")
    front = yaml.safe_load(m.group(1))
    standard = m.group(2).strip()
    contract = json.loads((folder / "contract.json").read_text())
    lists: dict[str, Any] = (
        json.loads((folder / "lists.json").read_text()) if (folder / "lists.json").exists() else {}
    )
    for key in ("name", "version", "mode", "writer_model", "validator_model", "sources"):
        if key not in front:
            raise SkillError(f"{folder.name}/SKILL.md front matter lacks `{key}`")
    if front["name"] != folder.name:
        raise SkillError(f"{folder.name}/SKILL.md names itself {front['name']}")
    if front["mode"] not in MODES:
        raise SkillError(f"{folder.name}: mode must be one of {MODES}")
    if not front["sources"]:
        raise SkillError(f"{folder.name}: a skill names the sources it draws on")
    if set(contract) != {"input", "output"}:
        raise SkillError(f"{folder.name}/contract.json is {{input, output}}")
    return {**front, "standard": standard, "contract": contract, "lists": lists, "folder": folder}


def _frame(root: Path, mode: str, validator: bool) -> str:
    return (root / "_frame" / ("validate.txt" if validator else f"{mode}.txt")).read_text()


def prompt_rows(root: Path) -> list[tuple[dict[str, Any], str]]:
    """(seed entry, text) for the two prompt rows of every skill under `root`."""
    out: list[tuple[dict[str, Any], str]] = []
    for folder in folders(root):
        s = read(folder)
        sources = "\n".join(f"- {x}" for x in s["sources"])
        for validator in (False, True):
            text = (
                _frame(root, s["mode"], validator)
                .replace("{{standard}}", s["standard"])
                .replace("{{sources}}", sources)
                .replace("{{title}}", s["name"].replace("-", " "))
            )
            schema = (
                VALIDATOR_SCHEMA
                if validator
                else (CHOICE_SCHEMA if s["mode"] == "choose" else s["contract"]["output"])
            )
            out.append(
                (
                    {
                        "purpose": purpose(s["name"], validator),
                        "version": s["version"],
                        "model": s["validator_model"] if validator else s["writer_model"],
                        "json_schema": schema,
                        "active": bool(s.get("active", False)),
                        "effort": s.get("validator_effort" if validator else "writer_effort"),
                    },
                    text,
                )
            )
    return out


def retire_old_versions(conn: db.Conn, t: db.Id, root: Path) -> None:
    """A skill's older versions stay as rows, but only the file's version may be active."""
    for p, _ in prompt_rows(root):
        if p["active"]:
            conn.execute(
                "update prompt set active = false, updated_at = now() where tenant_id = %s and purpose = %s"
                " and subject is null and version <> %s and active",
                (t, p["purpose"], p["version"]),
            )
