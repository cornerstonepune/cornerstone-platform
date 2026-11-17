"""CP-71: computed fixes for the pattern's problems (design E4; Done when 7). Nothing is guessed: for a problem, each lesson in it is tried in
every empty place of its own class (nearest first), the world with that move is run back through `tt_check.check`, and a move is offered only
when the problem is gone and no Must problem is new. Only when no move works is taking the lesson out offered, the same way. A fix is the
list of edits `tt_pattern.change` takes, so applying it is one ordinary change (and has its own undo). Pure; no database, no model."""

from dataclasses import replace

from engine.w2_print import tt_check as chk
from engine.w2_print.tt_check import DAYS, LESSONS, MUST, Place, World

SHOWN = 3  # fixes offered per problem


def _without(w: World, place: Place, to: Place | None) -> World:
    cells = {p: c for p, c in w.cells.items() if p != place}
    if to is not None:
        cells[to] = w.cells[place]
    return replace(w, cells=cells)


def _free(w: World, klass: str) -> list[Place]:
    return [
        (klass, pid, wk, wd)
        for pid in w.class_periods.get(klass, [])
        if not w.periods[pid]["fixed"]
        for wk in chk.WEEKS
        for wd in range(1, 6)
        if (klass, pid, wk, wd) not in w.cells
    ]


def _near(w: World, a: Place, b: Place) -> tuple:
    return (a[2] != b[2], abs(a[3] - b[3]), abs(w.periods[a[1]]["ord"] - w.periods[b[1]]["ord"]), b)


def _edits(w: World, place: Place, to: Place | None) -> list[dict]:
    out = [{"period_id": place[1], "week": place[2], "weekday": place[3], "op": "clear"}]
    if to is not None:
        c = w.cells[place]
        out.append({"period_id": to[1], "week": to[2], "weekday": to[3], "op": "set", "cell": c["cell"], "subject_code": c["subject_code"], "text": c["text"]})  # fmt: skip
    return out


def _says(w: World, place: Place, to: Place | None) -> str:
    what = chk.subject_words(w, place)
    at = f"{DAYS[place[3] - 1]} {w.periods[place[1]]['label']}"
    if to is None:
        return f"Take {what} out of {at}, week {place[2]}."
    there = f"{DAYS[to[3] - 1]} {w.periods[to[1]]['label']}"
    if to[2] == place[2]:
        return f"Move {what} from {at} to {there}, week {to[2]}."
    return f"Move {what} from {at} of week {place[2]} to {there} of week {to[2]}."


def _works(w: World, problem: dict, before: set[str], place: Place, to: Place | None) -> bool:
    after = chk.check(_without(w, place, to))
    return (
        problem["key"] not in {p["key"] for p in after}
        and {p["key"] for p in after if p["level"] == MUST} <= before
    )


def fixes_for(w: World, problem: dict, now: list[dict]) -> list[dict]:
    """Up to three fixes, each proven by running the checker on the pattern as it would be."""
    before = {p["key"] for p in now if p["level"] == MUST}
    lessons = [(p["class_id"], p["period_id"], p["week"], p["weekday"]) for p in problem["places"]]
    lessons = [p for p in lessons if p in w.cells and w.cells[p]["cell"] in LESSONS]
    # the nearest moves that work, for each lesson of the problem; then one of each lesson before a second of any, so a clash between two
    # classes offers a way out in either class
    per: list[list[dict]] = []
    for place in lessons:
        mine: list[dict] = []
        for to in sorted(_free(w, place[0]), key=lambda t: _near(w, place, t)):
            if len(mine) == SHOWN:
                break
            if _works(w, problem, before, place, to):
                mine.append(
                    {"class_id": place[0], "sentence": _says(w, place, to), "edits": _edits(w, place, to)}
                )
        per.append(mine)
    offered = [mine[rank] for rank in range(SHOWN) for mine in per if rank < len(mine)]
    if not offered:
        for place in lessons:
            if _works(w, problem, before, place, None):
                offered.append(
                    {"class_id": place[0], "sentence": _says(w, place, None), "edits": _edits(w, place, None)}
                )
                break
    return offered[:SHOWN]


def with_fixes(w: World, problems: list[dict]) -> list[dict]:
    return [{**p, "fixes": [] if p["allowed"] else fixes_for(w, p, problems)} for p in problems]
