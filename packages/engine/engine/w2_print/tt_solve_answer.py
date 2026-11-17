"""CP-75: a solver's answer read back and checked (design F7). Pure: no database, no solver, no model. `edits` is the answer as the cell
changes `tt_pattern` takes, `after` is the pattern as it would be, and `faults` is code's last word on it: the same checker the page uses,
plus the promises the solver made. `bent` says, in words, which rules had to give when nothing fits."""

from dataclasses import replace

from engine.adapters import cpsat
from engine.w2_print import tt_check as chk
from engine.w2_print.tt_check import DAYS, Place, World
from engine.w2_print.tt_solve_model import Model, _lesson, _span


def edits(w: World, model: Model, answer: cpsat.Answer, labels: dict[str, str]) -> dict[str, list[dict]]:
    """The answer as cell changes, per class being filled: machine-made cells that left are cleared, new places are set as machine-made."""
    target: dict[Place, tuple[str, str]] = {}
    for gid, placed in answer.placed.items():
        m = model.groups[gid]
        if m["class"] in model.fill:
            target.update({model.slots[s]: (m["kind"], m["head"]) for s in placed})
    out: dict[str, list[dict]] = {k: [] for k in sorted(model.fill)}
    movable = set(model.slots)
    for p, c in sorted(w.cells.items()):
        if p[0] in model.fill and _lesson(c) and p in movable and p not in target:
            out[p[0]].append({"period_id": p[1], "week": p[2], "weekday": p[3], "op": "clear"})
    for p, (kind, head) in sorted(target.items()):
        c = w.cells.get(p)
        if not c or (c["cell"], c["subject_code"]) != (kind, head):
            out[p[0]].append({
                "period_id": p[1], "week": p[2], "weekday": p[3], "op": "set", "cell": kind, "subject_code": head,
                "text": labels.get(head, head), "source": "machine",
            })  # fmt: skip
    return out


def after(w: World, changes: dict[str, list[dict]]) -> World:
    """The world as it would be with the edits applied."""
    cells = dict(w.cells)
    for k, es in changes.items():
        for e in es:
            p = (k, e["period_id"], e["week"], e["weekday"])
            cells.pop(p, None)
            if e["op"] == "set":
                cells[p] = {"cell": e["cell"], "subject_code": e["subject_code"], "text": e["text"]}
    return replace(w, cells=cells)


def faults(w: World, model: Model, answer: cpsat.Answer, then: World) -> list[str]:
    """Code's last word on an answer (design F7). Empty when it may be shown: no Must problem stands, every kept cell is where it was,
    nothing outside the classes being filled changed, every lesson is on a place of its own class, and every needed lesson is placed.
    A Must problem that stood before, wholly inside classes that are not being filled, is not this answer's fault."""
    stood = {
        p["key"]
        for p in chk.blocking(chk.check(w))
        if not any(x["class_id"] in model.fill for x in p["places"])
    }
    out = [p["sentence"] for p in chk.blocking(chk.check(then)) if p["key"] not in stood]
    for p, c in w.cells.items():
        if (p in model.kept or not _lesson(c) or p[0] not in model.fill) and then.cells.get(p) != c:
            out.append("A cell that must stay where it is was changed.")
    used: set[int] = set()
    by = {g.id: g for g in model.problem.groups}
    for gid, m in model.groups.items():
        placed = answer.placed.get(gid, [])
        if not set(placed) <= set(by[gid].slots) or used & set(placed):
            out.append("A lesson was put on a place it may not use.")
        used |= set(placed)
        if len(placed) + answer.short.get(gid, 0) != m["count"] or (
            by[gid].skip is None and len(placed) != m["count"]
        ):
            out.append(
                f"{w.classes[m['class']]}: not every {w.labels.get(m['head'], m['head'])} lesson was placed."
            )
    return sorted(set(out))


def bent(w: World, model: Model, answer: cpsat.Answer) -> list[dict]:
    """The rules that had to give for anything to fit, in words (design E4): 'It fits if ...'."""
    out = []

    def label(head: str) -> str:
        return w.labels.get(head, head)

    for key, n in sorted(answer.over.items()):
        m = model.caps[key]
        if (
            m["kind"] == "most"
            and next((r for r in w.limits if r["id"] == m["rule"]), {}).get("weight") is None
        ):
            out.append({
                "kind": "most", "rule": m["rule"],
                "sentence": f"It fits if {w.classes[m['class']]} may have {label(m['head'])} {m['most'] + n} times {_span(m['week'], m['weekday'])}"
                f" (the most is {m['most']}).",
            })  # fmt: skip
        elif m["kind"] == "away":
            when = f"{DAYS[m['weekday'] - 1]}{' of week ' + m['week'] if m['week'] else ''}"
            at = f" at {chk.when(w, m['period_id'])}" if m["period_id"] else ""
            what = " and ".join(label(h) for h in m["heads"])
            out.append(
                {
                    "kind": "away",
                    "rule": None,
                    "sentence": f"It fits if the educator for {what}, who is away on {when}{at}, may teach then.",
                }
            )
    for gid, n in sorted(answer.short.items()):
        m = model.groups[gid]
        out.append({
            "kind": "fewest", "rule": m["rule"],
            "sentence": f"It fits if {w.classes[m['class']]} has {label(m['head'])} {m['count'] - n} times {_span(m['week'])} instead of {m['count']}.",
        })  # fmt: skip
    return out
