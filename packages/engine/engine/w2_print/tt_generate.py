"""CP-11: one class and one fortnight → a draft timetable made by FET and kept with FET's exact input and output
(design.md §2–§4). Code works out what is needed and checks it (`tt_need`); FET only places. Nothing here writes to
`timetable_slot`, `session` or `plan_entry`: the run is the only row made, and `dry` makes none."""

import json
from dataclasses import dataclass, field

from engine.adapters import fet
from engine.core import db, settings
from engine.w2_print import tt_need as need

SOLVE_SECONDS, SEED = "timetable.solve_seconds", "timetable.seed"


@dataclass
class Run:
    outcome: str  # placed | unmeetable | not_found_in_time
    needed: int
    placed: int
    report: dict = field(default_factory=dict)
    draft: list[dict] = field(default_factory=list)
    input_text: str | None = None
    output_text: str | None = None
    fet_version: str | None = None
    seed: int = 0
    solve_seconds: int = 0
    tenant_id: str = ""
    class_id: str = ""
    fortnight_id: str = ""
    starts: dict[str, str] = field(default_factory=dict)  # period id -> start time, for the printout only


def _free_days(i: need.Inputs, week: str | None) -> int:
    """Days (of one week, or all) that have at least one free period."""
    return sum(
        1 for d in i.days if week in (None, d.week) and any(need.is_free(i, d, p["id"]) for p in i.periods)
    )


def _plan(i: need.Inputs, n: need.Needs) -> tuple[fet.Plan, dict[int, tuple[str, str]]]:
    """The FET description of the fortnight and, for each activity id, the (subject, week) it stands for."""
    days = [d.date.isoformat() for d in i.days]
    hours = [p["starts_at"] for p in i.periods]
    plan = fet.Plan(i.name, days, hours, sorted(n.lessons), [])
    plan.unavailable = [
        (d.date.isoformat(), p["starts_at"])
        for d in i.days
        for p in i.periods
        if not need.is_free(i, d, p["id"])
    ]
    made: dict[int, tuple[str, str]] = {}
    for subject in sorted(n.lessons):
        # a subject with a week limit keeps each week's lessons in that week; any other floats over the fortnight
        groups = [(w, c) for w, c in sorted(n.lessons[subject].items())] if subject in n.weekly else [
            (None, n.total(subject))
        ]  # fmt: skip
        for week, count in groups:
            ids = list(range(len(made) + 1, len(made) + 1 + count))
            for aid in ids:
                made[aid] = (subject, week or "")
                plan.activities.append((aid, subject))
                if week:
                    plan.only_on[aid] = [d.date.isoformat() for d in i.days if d.week == week]
            if 2 <= count <= _free_days(i, week):  # at most once a day, where the count allows
                plan.apart.append(ids)
    return plan, made


def _draft(
    i: need.Inputs, made: dict[int, tuple[str, str]], placed: dict[int, tuple[str, str]]
) -> list[dict]:
    week = {d.date.isoformat(): d.week for d in i.days}
    period = {p["starts_at"]: p["id"] for p in i.periods}
    out = [
        {"date": day, "week": week[day], "period_id": period[hour], "subject_code": made[aid][0]}
        for aid, (day, hour) in placed.items()
    ]
    return sorted(out, key=lambda x: (x["date"], x["period_id"]))


def _touching(i: need.Inputs, subjects: set[str]) -> list[dict]:
    """Every limit on these subjects and every block, in their own words: what FET's message may be about."""
    return [need._say(x) for x in i.limits if x["subject_code"] in subjects] + [
        need.say_block(b) for b in i.blocks
    ]


def generate(conn: db.Conn, grade: str, section: str, year: str, number: int) -> Run:
    """Work out the fortnight, and run FET unless the checks already show it cannot be met. Writes nothing."""
    i = need.load(conn, grade, section, year, number)
    n = need.needs(i)
    seconds, seed = int(settings.config(conn, SOLVE_SECONDS, 120)), int(settings.config(conn, SEED, 20261109))
    run = Run(
        "placed", n.total(), 0, {"free_periods": need.free_by_week(i)}, seed=seed, solve_seconds=seconds
    )
    run.tenant_id, run.class_id, run.fortnight_id = i.tenant_id, i.class_id, i.fortnight_id
    run.starts = {p["id"]: p["starts_at"] for p in i.periods}
    failing, why = need.checks(i, n)
    if failing:
        run.outcome, run.report = "unmeetable", {**run.report, "failed": failing, "rules": why}
        return run
    if not n.total():
        return run
    plan, made = _plan(i, n)
    version = fet.version()
    run.fet_version, run.input_text = version, fet.build_input(plan, version)
    result = fet.run(run.input_text, seconds, seed)
    run.output_text, run.placed = result.output_text, len(result.placed)
    run.draft = _draft(i, made, result.placed)
    if run.placed == run.needed:
        return run
    if result.timed_out:
        run.outcome = "not_found_in_time"
        run.report["words"] = f"no timetable found in {seconds} seconds"
        return run
    run.outcome, run.draft = "unmeetable", []
    run.report |= {"fet": result.impossible, "rules": _touching(i, set(n.lessons))}
    return run


def keep(conn: db.Conn, run: Run) -> None:
    """Keep the run as it stands (append-only)."""
    conn.execute(
        "insert into timetable_run (tenant_id, school_class_id, fortnight_id, outcome, needed, placed, input_text,"
        " output_text, fet_version, seed, solve_seconds, report, draft) values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (run.tenant_id, run.class_id, run.fortnight_id, run.outcome, run.needed, run.placed, run.input_text,
         run.output_text, run.fet_version, run.seed, run.solve_seconds, json.dumps(run.report), json.dumps(run.draft)),
    )  # fmt: skip


def lines(run: Run) -> list[str]:
    """What the command prints: the outcome, the two numbers first, then the report in the rules' own words."""
    out = [f"needed {run.needed}", f"placed {run.placed}", f"outcome {run.outcome}"]
    if run.outcome == "not_found_in_time":
        out.append(run.report["words"])
    for failed in run.report.get("failed", []):
        out.append(f"cannot be met: {failed}")
    if run.report.get("fet"):
        out.append(f"FET said: {run.report['fet']}")
    out += [f"  {r['kind']} {r['id']}: {r['words']}" for r in run.report.get("rules", [])]
    out += [f"  {x['date']} {x['week']} {run.starts[x['period_id']]} {x['subject_code']}" for x in run.draft]
    return out
