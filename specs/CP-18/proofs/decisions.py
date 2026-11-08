"""Item 1's reading of the repository's own record: the decisions-log line that scores `materials_read`, the seeded
bars and the seeded prompt rows. Shared by test_prompt_scored.py (here) and live_prompt.py (the box).

The log line it reads is the newest row of DECISIONS-LOG.md (newest first) that names `materials_read`, a version
`vN` and `lines`. Each measure is read as the first number after its bare name (not after a bar key such as
`eval.materials_read.found`): for example "found 0.91 (bar 0.80), held_back_right 1.0 (bar 0.95), confirmed_wrong 0
(bar at most 0), lines 104"."""

import json
import os
import re
from pathlib import Path

ROOT = Path(os.environ.get("ATHENA_ROOT", Path(__file__).resolve().parents[3]))
SEED = ROOT / "supabase" / "seed"
PURPOSE = "materials_read"
BARS = {  # measure: (threshold key, the direction a score must be on)
    "confirmed_wrong": ("eval.materials_read.confirmed_wrong_at_most", "at_most"),
    "found": ("eval.materials_read.found", "at_least"),
    "held_back_right": ("eval.materials_read.held_back_right", "at_least"),
    "lines": ("eval.materials_read.lines", "at_least"),
}


def thresholds() -> dict:
    return {r["key"]: float(r["value"]) for r in json.loads((SEED / "thresholds.json").read_text())["thresholds"]}


def seeded_active_versions() -> list[int]:
    return [p["version"] for p in json.loads((SEED / "prompts.json").read_text())["prompts"]
            if p["purpose"] == PURPOSE and p.get("active")]


def gold_cases() -> list[dict]:
    return json.loads((SEED / "materials_read_gold.json").read_text())["cases"]


def score_line() -> str | None:
    for line in (ROOT / "DECISIONS-LOG.md").read_text().splitlines():
        if line.startswith("|") and PURPOSE in line and re.search(r"\bv\d+\b", line) and re.search(r"\blines\b", line):
            return line
    return None


def logged_version(line: str) -> int:
    m = re.search(rf"{PURPOSE}`?\**\s+v(\d+)", line)
    assert m, f"the log line names no `{PURPOSE} vN`: {line[:160]}"
    return int(m.group(1))


def measure(line: str, name: str) -> float | None:
    m = re.search(rf"(?<![.\w]){name}(?!\w)[^0-9|\n]{{0,30}}?(\d+(?:\.\d+)?)", line)
    return float(m.group(1)) if m else None
