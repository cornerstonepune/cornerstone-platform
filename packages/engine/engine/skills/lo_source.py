"""What code does to a learning objective's source before a model writes from it, and what it shows the checker (CP-54).

parts     a source line that is a list ("Grammar: command verbs, sequencing words, instructional vocabulary") is one
          write job per part, each told its part and the others, so no part is dropped and no note is needed.
nearest   the objectives of the same grade closest in wording to a piece of text: a short list a reader is shown, so
          "it repeats another objective" is judged by someone who can see the other objective (ADR 0102).
The separators, the words that decide nothing and the list's size are the skill's own `lists.json` (CLAUDE.md rule 1).
"""

import functools
import json
import re
from typing import Any

from engine.core import settings
from engine.skills.rules import stems

Lists = dict[str, Any]
Data = dict[str, Any]


def _section(text: str, lists: Lists) -> list[str]:
    """One labelled section's parts, each with its label ("Grammar: command verbs"), or the section alone."""
    label, mark, body = text.partition(lists["part_label"])
    if not mark or not label.strip() or len(label) > int(lists["part_label_max"]):
        return [text]
    seps = "|".join(re.escape(s) for s in lists["part_separators"])
    flat = re.sub(r"\([^)]*\)", lambda m: "\x00" * len(m.group(0)), body)  # brackets hidden, lengths kept
    cuts = [m.span() for m in re.finditer(rf"(?<!\d)(?:{seps})|(?:{seps})(?!\d)", flat)]
    out, at = [], 0
    for a, b in [*cuts, (len(body), len(body))]:
        piece = body[at:a].strip(" /;,")
        if piece:
            out.append(f"{label.strip()}{lists['part_label']} {piece}")
        at = b
    return out or [text]


def parts(text: str, lists: Lists) -> list[str]:
    """The parts of a list-type line, or the line alone. A list is a label, the school's `part_label` mark (":"), then
    parts set apart by its `part_separators`; a line may hold several such sections, set apart by `part_sections`. A
    separator inside brackets or between two digits (1,000) is not one. Each part keeps its section's label."""
    secs = "|".join(re.escape(s) for s in lists["part_sections"])
    sections = [s.strip(" */") for s in re.split(secs, text or "") if s.strip(" */")]
    out = [p for s in sections for p in _section(s, lists)]
    return out if len(out) > 1 else [text]


def part_inputs(inputs: Data, lists: Lists) -> list[Data]:
    """One input a part. The school's line stays whole in `text` (a rewrite keeps the original); `part` is what this
    objective covers and `other_parts` what the others cover."""
    found = parts(inputs["text"], lists)
    if len(found) < 2:
        return [inputs]
    return [{**inputs, "part": p, "other_parts": [o for o in found if o != p]} for p in found]


def nearest(text: str, pool: list[Data], lists: Lists) -> list[Data]:
    """The `nearest_size` objectives of `pool` ({code, text}) closest in wording to `text`, closest first: by the
    deciding words they share, a word few objectives of the pool hold counting for more than one many hold (a story's
    name against "tells"). One that shares no word is never listed. "The child" opens every objective and decides nothing."""
    plain = tuple(lists["plain_words"])
    mine = stems(text, plain)
    theirs = [(o, stems(o["text"], plain)) for o in pool]
    held: dict[str, int] = {}
    for _, words in theirs:
        for w in words & mine:
            held[w] = held.get(w, 0) + 1
    scored = [(-sum(1 / held[w] for w in words & mine), o["code"], o) for o, words in theirs if words & mine]
    return [{"code": o["code"], "text": o["text"]} for *_, o in sorted(scored, key=lambda s: s[:2])][
        : int(lists["nearest_size"])
    ]


@functools.cache
def seed_pool(grade: str) -> tuple[tuple[str, str], ...]:
    """(code, text) of every objective the seed's reviewed rewrites hold for one grade: what an eval case is compared
    with, as the live rows are in a real run. The grade is the file's name."""
    path = settings.SEED / "curriculum" / "lo_rewrites" / f"{grade}.json"
    rows = json.loads(path.read_text()).get("rows", []) if path.exists() else []
    return tuple(
        (r["lo_code"], r["new_title"]) for r in rows if r.get("action") == "rewrite" and r.get("new_title")
    )


def shown(inputs: Data, text: str, lists: Lists, own: str = "", pool: list[Data] | None = None) -> Data:
    """The inputs as a checker of `text` is shown them: with the objectives nearest to it. `pool` is the grade's
    objectives ({code, text}); without one it is the seed's, for an eval case. `own` is the code being written, which
    is never its own neighbour."""
    if pool is None:
        pool = [{"code": c, "text": t} for c, t in seed_pool(inputs["grade"])]
    return {**inputs, "nearest": nearest(text, [o for o in pool if o["code"] != own], lists)}
