"""CP-75: the timetable as a placement problem, and the answer read back (design F7). Pure: no database, no solver, no model.

`build` turns the checker's own `World` into the plain description the solver adapter takes: groups of alike lessons (one class's lessons of
one subject in a week or the fortnight), the places each may use, and the rules as caps. What is needed is each limit's *fewest*, never less
than what is already there. A cell a person set, and every cell of a class that is not being filled, is kept where it is; a machine-made
cell may move, and each one that does is a change the solver pays for. The answer is read back, and checked, in `tt_solve_answer`."""

import math
from dataclasses import dataclass, field, replace

from engine.adapters import cpsat
from engine.w2_print import tt_check as chk
from engine.w2_print.tt_check import ANY, DAYS, LESSONS, WEEKS, Place, World

BEND = 1000  # the cost of bending one rule by one lesson, when the question is "what would have to give"
OTHER = {"subject": "specialist", "specialist": "subject"}


@dataclass
class Model:
    problem: cpsat.Problem
    slots: list[Place]  # a slot's number is its index here
    groups: dict[str, dict]  # group id -> class, head, kind, week (None: the fortnight), count
    caps: dict[str, dict]  # cap key -> what it stands for, for the words
    fill: set[str]
    kept: set[Place]  # lesson cells that stay where they are
    refusals: list[dict]  # why it cannot be met, found by arithmetic before any solve


def _lesson(c: dict | None) -> bool:
    return bool(c and c["cell"] in LESSONS and c["subject_code"])


def free(w: World, klass: str) -> list[Place]:
    """Every place of the class a lesson may sit on: not a fixed period, not a fixed cell."""
    out = []
    for pid in w.class_periods.get(klass, []):
        if w.periods[pid]["fixed"]:
            continue
        for wk in WEEKS:
            for wd in range(1, 6):
                p = (klass, pid, wk, wd)
                if p not in w.cells or _lesson(w.cells[p]):
                    out.append(p)
    return out


def _span(week: str | None, weekday: int | None = None) -> str:
    if weekday:
        return f"on {DAYS[weekday - 1]} of week {week}"
    return f"in week {week}" if week else "in the fortnight"


def _rule(w: World, klass: str, head: str, span: str) -> dict | None:
    return next(
        (r for r in sorted(w.limits, key=lambda r: r["id"]) if (r["class"], r["subject_code"], r["span"]) == (klass, head, span)),
        None,
    )  # fmt: skip


def _want(rule: dict | None, have: int, pinned: int) -> int:
    want = max((rule or {}).get("fewest") or 0, have)
    if rule and rule["most"] is not None and not rule["weight"]:
        want = max(pinned, min(want, max(rule["most"], (rule.get("fewest") or 0))))
    return want


@dataclass
class _Draft:
    """What `build` gathers as it goes."""

    w: World
    fill: set[str]
    slots: list[Place]
    num: dict[Place, int]
    kept: set[Place]
    cur: dict[tuple[str, str, str], list[Place]]  # (class, head, cell kind) -> the lesson cells there now
    bend: bool
    groups: list[cpsat.Group] = field(default_factory=list)
    meta: dict[str, dict] = field(default_factory=dict)
    of: dict[Place, str] = field(default_factory=dict)  # a lesson cell -> its group
    caps: list[cpsat.Cap] = field(default_factory=list)
    capmeta: dict[str, dict] = field(default_factory=dict)

    def add(
        self,
        k: str,
        head: str,
        kind: str,
        week: str | None,
        count: int,
        places: list[Place],
        rule: dict | None,
        tag: str = "",
    ) -> None:
        gid = f"{k}|{head}|{kind}|{week or 'AB'}{tag}"
        mine = [p for p in places if p in self.kept]
        skip = None
        if k in self.fill and count > len(mine):
            # leaving a lesson out costs a little more than bending a rule about where it sits, so the report names that rule first
            skip = (
                BEND + 1
                if self.bend
                else ((rule or {}).get("weight") or None)
                if count > len(places)
                else None
            )
        usable = [
            p for p in self.slots if p[0] == k and week in (None, p[2]) and (p not in self.kept or p in mine)
        ]
        now = [self.num[p] for p in places if p not in self.kept]
        self.groups.append(
            cpsat.Group(gid, [self.num[p] for p in usable], count, [self.num[p] for p in mine], now, skip)
        )
        self.meta[gid] = {
            "class": k,
            "head": head,
            "kind": kind,
            "week": week,
            "count": count,
            "rule": (rule or {}).get("id"),
            "who": self.w.educators.get((k, head, kind)),
        }
        self.of.update({p: gid for p in places})

    def inside(self, gids: list[str], places: list[Place]) -> int:
        """Kept lessons of these groups already on these places: a cap never asks for fewer than what must stay."""
        return sum(1 for p in places if p in self.kept and self.of.get(p) in gids)

    def cap(
        self, key: str, gids: list[str], places: list[Place], most: int, cost: int | None, what: dict
    ) -> None:
        self.caps.append(
            cpsat.Cap(key, gids, [self.num[p] for p in places], max(most, self.inside(gids, places)), cost)
        )
        self.capmeta[key] = what


def _filled(d: _Draft, k: str, head: str, specialists: set[str]) -> None:
    """The groups of one subject in a class being filled: a week each where it has a weekly count, else the fortnight; what is there stays
    counted, and a fortnight count above the two weeks is a group of its own that may sit in either week."""
    wk, fn = _rule(d.w, k, head, "week"), _rule(d.w, k, head, "fortnight")
    main = "specialist" if head in specialists else "subject"
    total = 0
    for week in WEEKS if wk else (None,):
        a = [p for p in d.cur.get((k, head, main), []) if week in (None, p[2])]
        b = [p for p in d.cur.get((k, head, OTHER[main]), []) if week in (None, p[2])]
        rule = wk if week else fn
        want = _want(rule, len(a) + len(b), sum(p in d.kept for p in a + b))
        if b:
            d.add(k, head, OTHER[main], week, len(b), b, None)
        count = max(want - len(b), sum(p in d.kept for p in a))
        if count or a:
            d.add(k, head, main, week, count, a, rule)
        total += count + len(b)
    if wk and fn and (fn["fewest"] or 0) > total:
        d.add(k, head, main, None, fn["fewest"] - total, [], fn, "+")


def build(
    w: World, fill: set[str], sources: dict[Place, str], specialists: set[str], bend: bool = False
) -> Model:
    slots = sorted(p for k in w.classes for p in free(w, k))
    num = {p: i for i, p in enumerate(slots)}
    lessons = {p: c for p, c in w.cells.items() if _lesson(c) and p in num}
    kept = {p for p in lessons if p[0] not in fill or sources.get(p) == "person"}
    cur: dict[tuple[str, str, str], list[Place]] = {}
    for p, c in sorted(lessons.items()):
        cur.setdefault((p[0], c["subject_code"], c["cell"]), []).append(p)
    d = _Draft(w, fill, slots, num, kept, cur, bend)
    for k in sorted(w.classes):
        asked = (
            {r["subject_code"] for r in w.limits if r["class"] == k and r["fewest"]} if k in fill else set()
        )
        for head in sorted({h for (kk, h, _) in cur if kk == k} | asked):
            if k in fill:
                _filled(d, k, head, specialists)
                continue
            for kind in LESSONS:  # a class that is only read: its lessons stay where they are
                if cur.get((k, head, kind)):
                    d.add(k, head, kind, None, len(cur[(k, head, kind)]), cur[(k, head, kind)], None)
    _most_caps(d)
    _away_caps(d)
    _educator_caps(d)
    model = Model(
        cpsat.Problem(d.groups, d.caps, _nudges(d.groups, d.meta, slots, fill)),
        slots,
        d.meta,
        d.capmeta,
        set(fill),
        kept,
        [],
    )
    model.refusals = _refusals(w, model)
    return model


def _most_caps(d: _Draft) -> None:
    """Each "at most" of a class being filled: a day, a week or the fortnight. With a weight it is a Try to, without one a Must. A rule
    about every subject ("at most 2 of one subject in a day") is one cap for each subject the class has."""
    spans = {"day": [(wk, wd) for wk in WEEKS for wd in range(1, 6)], "week": [(wk, None) for wk in WEEKS]}
    rules = [
        r for r in sorted(d.w.limits, key=lambda r: r["id"]) if r["class"] in d.fill and r["most"] is not None
    ]
    for r in rules:
        mine = sorted({m["head"] for m in d.meta.values() if m["class"] == r["class"]})
        for head in mine if r["subject_code"] == ANY else [r["subject_code"]]:
            gids = [g for g, m in d.meta.items() if (m["class"], m["head"]) == (r["class"], head)]
            for wk, wd in spans.get(r["span"], [(None, None)]):
                here = [
                    p for p in d.slots if p[0] == r["class"] and wk in (None, p[2]) and wd in (None, p[3])
                ]
                what = {
                    "kind": "most",
                    "rule": r["id"],
                    "class": r["class"],
                    "head": head,
                    "most": r["most"],
                    "week": wk,
                    "weekday": wd,
                }
                d.cap(
                    f"most:{r['id']}:{head}:{wk or 'AB'}:{wd or 0}",
                    gids,
                    here,
                    r["most"],
                    r["weight"] or (BEND if d.bend else None),
                    what,
                )


def _away_caps(d: _Draft) -> None:
    """An educator who is away teaches nothing then (beyond a kept lesson somebody allowed)."""
    for i, a in enumerate(d.w.away):
        gids = [g for g, m in d.meta.items() if m["who"] == a["staff"]]
        classes = {d.meta[g]["class"] for g in gids}
        here = [
            p for p in d.slots
            if p[0] in classes and p[3] == a["weekday"] and a["week"] in (None, p[2])
            and (not a["period_id"] or chk.overlap(d.w.periods[p[1]], d.w.periods[a["period_id"]]))
        ]  # fmt: skip
        if here:
            d.cap(f"away:{i}", gids, here, 0, BEND if d.bend else None, {"kind": "away", "rule": None, "weekday": a["weekday"],
                  "week": a["week"], "period_id": a["period_id"], "heads": sorted({d.meta[g]["head"] for g in gids})})  # fmt: skip


def _educator_caps(d: _Draft) -> None:
    """An educator teaches one class at a time: for each moment a period starts, at most one of their lessons among the places of
    different classes that are running then (two periods overlap exactly when one is running as the other starts)."""
    by_who: dict[str, list[str]] = {}
    for g, m in d.meta.items():
        if m["who"]:
            by_who.setdefault(m["who"], []).append(g)
    start = lambda p: chk.minutes(d.w.periods[p[1]]["start"])  # noqa: E731
    end = lambda p: chk.minutes(d.w.periods[p[1]]["end"])  # noqa: E731
    seen: set[tuple] = set()
    for who, gids in sorted(by_who.items()):
        classes = {d.meta[g]["class"] for g in gids}
        days = [(wk, wd) for wk in WEEKS for wd in range(1, 6)] if len(classes) > 1 else []
        for wk, wd in days:
            day = [p for p in d.slots if p[0] in classes and p[2] == wk and p[3] == wd]
            for at in sorted({start(p) for p in day}):
                clique = tuple(p for p in day if start(p) <= at < end(p))
                if len({p[0] for p in clique}) > 1 and (who, clique) not in seen:
                    seen.add((who, clique))
                    d.cap(f"educator:{who}:{wk}:{wd}:{at}", gids, list(clique), 1, None, {"kind": "educator"})


def _nudges(groups: list[cpsat.Group], meta: dict, slots: list[Place], fill: set[str]) -> list[cpsat.Cap]:
    """A subject's lessons spread evenly over its days: a tie-break only, below every rule and every change."""
    out = []
    for g in groups:
        if meta[g.id]["class"] not in fill or g.count < 2:
            continue
        days: dict[tuple[str, int], list[int]] = {}
        for s in g.slots:
            days.setdefault((slots[s][2], slots[s][3]), []).append(s)
        each = math.ceil(g.count / max(1, len(days)))
        out += [
            cpsat.Cap(f"nudge:{g.id}:{wk}:{wd}", [g.id], here, each, 1)
            for (wk, wd), here in sorted(days.items())
        ]
    return out


def _refusals(w: World, model: Model) -> list[dict]:
    """What arithmetic alone shows cannot be met (design F8): a cell that is kept already breaks a Must rule, a subject needs more places
    than it may use, or a class needs more lessons than it has places."""
    out = []
    pinned = replace(w, cells={p: c for p, c in w.cells.items() if p in model.kept or not _lesson(c)})
    for p in chk.blocking(chk.check(pinned)):
        if any(x["class_id"] in model.fill for x in p["places"]):
            out.append(
                {
                    "kind": p["kind"],
                    "rule": None,
                    "sentence": f"A lesson that is kept where it is already breaks a rule: {p['sentence']}",
                }
            )
    label = lambda m: w.labels.get(m["head"], m["head"])  # noqa: E731
    by = {g.id: g for g in model.problem.groups}
    for gid, m in model.groups.items():
        if m["class"] in model.fill and by[gid].skip is None and m["count"] > len(by[gid].slots):
            out.append({
                "kind": "fewest", "rule": m["rule"], "class_id": m["class"],
                "sentence": f"{w.classes[m['class']]}: {label(m)} needs {m['count']} {_span(m['week'])} and there are {len(by[gid].slots)} free places.",
            })  # fmt: skip
    for k in sorted(model.fill):
        if any(r["kind"] == "fewest" and r.get("class_id") == k for r in out):
            continue  # one subject alone does not fit: the class's totals would only say the same thing again
        short = []
        for week in (*WEEKS, None):
            need = sum(
                m["count"]
                for g, m in model.groups.items()
                if m["class"] == k and by[g].skip is None and week in (None, m["week"])
            )
            room = sum(1 for p in model.slots if p[0] == k and week in (None, p[2]))
            if need > room and not (
                week is None and short
            ):  # the fortnight's total only when neither week says it
                short.append(
                    {
                        "kind": "room",
                        "rule": None,
                        "sentence": f"{w.classes[k]} needs {need} lessons {_span(week)} and has {room} places.",
                    }
                )
        out += short
    return out
