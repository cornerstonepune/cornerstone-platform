"""OR-Tools CP-SAT, the placement solver (CP-75, design F7): the only file that names it. It takes a plain description (groups of alike
lessons, the slots each may use, caps on how many may sit in a set of slots) and returns where the lessons go. It knows nothing about the
school: every count, every rule and every word is the caller's (`w2_print/tt_solve_model.py`), and the caller checks the answer with its own
code before anyone sees it. One worker and a fixed seed, so the same description gives the same answer."""

import json
from dataclasses import asdict, dataclass, field

PLACED, UNMEETABLE, OUT_OF_TIME = "placed", "unmeetable", "out_of_time"


class CpsatMissing(RuntimeError):
    """The `ortools` package is not installed on this machine."""


@dataclass
class Group:
    """Lessons that are alike (one class's lessons of one subject in one span): `count` of them go on `slots`, at most one per slot."""

    id: str
    slots: list[int]
    count: int
    kept: list[int] = field(default_factory=list)  # slots that must hold one (a person put it there)
    now: list[int] = field(default_factory=list)  # slots that hold one today: each one left costs a change
    skip: int | None = None  # the cost of each lesson left out; None: every one must be placed


@dataclass
class Cap:
    """At most `most` lessons of `groups` on `slots`. `cost` None is a Must; a number is the cost of each lesson over."""

    key: str
    groups: list[str]
    slots: list[int]
    most: int
    cost: int | None = None


@dataclass
class Problem:
    groups: list[Group]
    caps: list[Cap] = field(default_factory=list)
    nudges: list[Cap] = field(
        default_factory=list
    )  # preferences that only break ties: below every cost and every change


@dataclass
class Answer:
    status: str  # placed | unmeetable | out_of_time
    placed: dict[str, list[int]] = field(default_factory=dict)  # group id -> the slots its lessons are on
    over: dict[str, int] = field(default_factory=dict)  # cap key -> lessons over its most (costed caps only)
    short: dict[str, int] = field(default_factory=dict)  # group id -> lessons left out
    seconds: float = 0.0
    proven: bool = False  # the solver proved nothing better exists (False: it stopped at the time limit)
    version: str = ""


def _lib():
    try:
        import ortools
        from ortools.sat.python import cp_model
    except ImportError as gone:
        raise CpsatMissing(
            "the ortools package is not installed here (packages/engine/pyproject.toml)"
        ) from gone
    return ortools, cp_model


def version() -> str:
    return f"OR-Tools CP-SAT {_lib()[0].__version__}"


def text(problem: Problem) -> str:
    """The description as the run keeps it: the same problem gives the same bytes."""
    return json.dumps(asdict(problem), sort_keys=True, separators=(",", ":"))


def _groups(m, x: dict, problem: Problem) -> tuple[list, list, dict]:
    """Each group's lessons on its slots: the kept ones fixed, the count met (or the shortfall costed), a change for each one that left."""
    cost, changes, short = [], [], {}
    for g in problem.groups:
        mine = [x[(g.id, s)] for s in sorted(set(g.slots))]
        for s in g.kept:
            m.add(x[(g.id, s)] == 1)
        if g.skip is None:
            m.add(sum(mine) == g.count)
        else:
            short[g.id] = m.new_int_var(0, g.count, f"short:{g.id}")
            m.add(sum(mine) + short[g.id] == g.count)
            cost.append(g.skip * short[g.id])
        changes += [1 - x[(g.id, s)] for s in g.now if (g.id, s) in x and s not in g.kept]
    return cost, changes, short


def _held(m, x: dict, cap: Cap, name: str):
    """One cap in the model. A Must is a constraint and gives nothing back; a costed one gives (its cost term, how far over it is)."""
    inside = [x[(g, s)] for g in cap.groups for s in cap.slots if (g, s) in x]
    if not inside:
        return None
    if cap.cost is None:
        m.add(sum(inside) <= cap.most)
        return None
    extra = m.new_int_var(0, len(inside), f"{name}:{cap.key}")
    m.add(sum(inside) <= cap.most + extra)
    return cap.cost * extra, extra


def _model(cp, problem: Problem):
    m = cp.CpModel()
    x = {(g.id, s): m.new_bool_var(f"{g.id}@{s}") for g in problem.groups for s in sorted(set(g.slots))}
    by_slot: dict[int, list] = {}
    for (_, s), var in x.items():
        by_slot.setdefault(s, []).append(var)
    for here in by_slot.values():
        m.add_at_most_one(here)
    cost, changes, short = _groups(m, x, problem)
    over = {}
    for cap in problem.caps:
        if got := _held(m, x, cap, "over"):
            cost.append(got[0])
            over[cap.key] = got[1]
    nudge = [got[0] for cap in problem.nudges if (got := _held(m, x, cap, "nudge"))]
    # three tiers in one number: costs, then cells changed, then the tie-breaking nudges
    low = sum(c.cost or 0 for c in problem.nudges) * (sum(g.count for g in problem.groups) + 1) + 1
    m.minimize(low * (len(changes) + 1) * sum(cost) + low * sum(changes) + sum(nudge))
    return m, x, over, short


def solve(problem: Problem, seconds: float, seed: int) -> Answer:
    _, cp = _lib()
    m, x, over, short = _model(cp, problem)
    solver = cp.CpSolver()
    solver.parameters.max_time_in_seconds = float(seconds)
    solver.parameters.num_workers = 1
    solver.parameters.random_seed = int(seed)
    status = solver.solve(m)
    out = Answer(PLACED, seconds=round(solver.wall_time, 3), version=version())
    if status == cp.MODEL_INVALID:
        raise ValueError(f"the placement description is not one CP-SAT accepts: {m.validate()}")
    if status not in (cp.OPTIMAL, cp.FEASIBLE):
        out.status = UNMEETABLE if status == cp.INFEASIBLE else OUT_OF_TIME
        return out
    out.proven = status == cp.OPTIMAL
    for g in problem.groups:
        out.placed[g.id] = [s for s in sorted(set(g.slots)) if solver.value(x[(g.id, s)])]
    out.over = {k: solver.value(v) for k, v in over.items() if solver.value(v)}
    out.short = {k: solver.value(v) for k, v in short.items() if solver.value(v)}
    return out
