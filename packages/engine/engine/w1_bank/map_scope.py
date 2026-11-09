"""What a proposing run covers and what it costs (goals/m1-12r-map-bar-and-count.yaml).

`propose` called the proposer once for every activity with any gap (every K2 activity, most of which lack only an objective
or level words); Nimish's links are the activities with no skill link. This says which activities a run calls the proposer
for, keeps only the proposals of the kind asked for, and prices the run before a call is made. Reads only.
"""

from engine.adapters import llm_budget
from engine.core import db
from engine.w1_bank.map_agents import PROPOSE, Band, Proposal, kinds_missing


def to_propose(b: Band, done: set, kind: str = "") -> list[str]:
    """The activities the proposer is called for: those with a gap that nothing has been proposed for yet; with `kind`,
    only those whose gap is of that kind (`skill`: no skill link at all)."""
    todo = [
        c for c in sorted(b.gaps) if not any((k, c, "") in done for k in ("skill", "objective", "levels"))
    ]
    return [c for c in todo if kind in kinds_missing(b.gaps[c])] if kind else todo


def only_kind(made: list[Proposal], kind: str) -> list[Proposal]:
    """What a run for one kind records: that kind's proposals (a skill's offers are skills), nothing else."""
    wanted = {"skill": {"skill", "skill_offer"}}.get(kind)
    return [p for p in made if p.kind in wanted] if wanted else made


def estimate(conn: db.Conn, gaps: int) -> tuple[int, float | None, int]:
    """(gaps, dollars a proposer call has cost on average, calls that average is taken from). Reads only."""
    camp = llm_budget.campaign_for(conn, PROPOSE)
    got = db.one(
        conn,
        "select count(*) as calls, avg(cost_inr) as inr from flow_run where flow = %s and cost_inr is not null",
        (PROPOSE,),
    )
    if not got["calls"] or camp is None:
        return gaps, None, 0
    return gaps, float(got["inr"]) / camp["inr_per_usd"], got["calls"]


def estimate_line(gaps: int, per_call: float | None, calls: int) -> str:
    """The count and the price in words (the validator is off, so the proposer is the whole price)."""
    if per_call is None:
        return f"{gaps} activities to propose for; the cost of a call is not measured (none was paid for yet)"
    return (
        f"{gaps} activities to propose for; about ${per_call:.4f} a proposer call over {calls} paid calls, "
        f"so about ${per_call * gaps:.2f}"
    )
