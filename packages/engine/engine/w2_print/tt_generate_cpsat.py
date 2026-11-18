"""CP-75, Done when 4: CP-11's fortnight generator with CP-SAT in FET's place. `place` takes the same plain plan `tt_generate` hands FET
(one class, its days and hours, the activities, where nothing may go, which days an activity may fall on, which must fall on different
days) and returns the same kind of result, so the generator's counting, checks, report and kept run are unchanged. FET stays the
generator's default until the school switches; this file is the proof that it can."""

import json

from engine.adapters import cpsat, fet

IMPOSSIBLE = "the rules cannot all hold: no placement puts every lesson on a free period"


def problem(plan: fet.Plan) -> tuple[cpsat.Problem, dict[str, list[int]], list[tuple[str, str]]]:
    """The plan as groups of alike activities (same subject, same allowed days) and one cap a day for those that must be apart."""
    barred = set(plan.unavailable)
    slots = [(d, h) for d in plan.days for h in plan.hours if (d, h) not in barred]
    ids: dict[str, list[int]] = {}
    days: dict[str, list[str]] = {}
    for aid, subject in plan.activities:
        on = plan.only_on.get(aid, [])
        gid = f"{subject}|{on[0] if on else ''}"
        ids.setdefault(gid, []).append(aid)
        days[gid] = on
    groups = [
        cpsat.Group(gid, [i for i, (d, _) in enumerate(slots) if not days[gid] or d in days[gid]], len(mine))
        for gid, mine in ids.items()
    ]
    caps = []
    for n, apart in enumerate(plan.apart):
        gids = [gid for gid, mine in ids.items() if set(mine) & set(apart)]
        if {a for gid in gids for a in ids[gid]} != set(apart):
            raise ValueError("activities that must be apart are not whole groups of alike activities")
        caps += [
            cpsat.Cap(f"apart:{n}:{d}", gids, [i for i, (day, _) in enumerate(slots) if day == d], 1)
            for d in plan.days
        ]
    return cpsat.Problem(groups, caps), ids, slots


def place(plan: fet.Plan, seconds: int, seed: int) -> tuple[str, fet.Result]:
    """→ (the description the run keeps as its input, the placements as FET's adapter gives them)."""
    described, ids, slots = problem(plan)
    answer = cpsat.solve(described, seconds, seed)
    placed = {aid: slots[s] for gid, on in answer.placed.items() for aid, s in zip(ids[gid], on, strict=True)}
    said = json.dumps({str(a): list(p) for a, p in sorted(placed.items())})
    return cpsat.text(described), fet.Result(
        answer.version, said if placed else None, placed, answer.status == cpsat.OUT_OF_TIME,
        IMPOSSIBLE if answer.status == cpsat.UNMEETABLE else None,
    )  # fmt: skip
