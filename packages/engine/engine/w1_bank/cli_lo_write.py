"""`engine curriculum lo-write` (CP-54): the learning-objective skill rewrites a grade's lines that are not yet objectives
(`lo_write.py`). `--estimate` builds every job and prices the run by code, no call. `--apply --by` runs it and writes the
objectives as the machine's, one run `revert-seed` undoes whole. The log of a run on the server is public: codes and counts
only, never a line's or a model's words (the replies are kept on the run's rows)."""

import typer

from engine.core import db, settings, skill_spec
from engine.skills import machines, spend
from engine.w1_bank import lo_write
from engine.w1_bank.cli_map import APPLY, BY, _needs_by, _tenant, staff_of
from engine.w1_bank.k2_upload import curriculum_app

SKILL = "learning-objective"
CEILING = 1.3  # a run may spend at most this times its forecast (orchestrator, 18 Nov)


@curriculum_app.command("lo-write")
def lo_write_(
    grade: str = typer.Option(
        "", "--grade", help="only this grade's lines; every grade that has any when not given"
    ),
    write: bool = APPLY,
    by: str = BY,
    stage: str = typer.Option("draft", "--stage", help="the cp-54 campaign's stage that pays"),
    limit: int = typer.Option(0, "--limit", help="write this many jobs only (a probe); 0 is every one"),
    estimate_only: bool = typer.Option(False, "--estimate", help="build the jobs and price them; no call"),
) -> None:
    """CP-54: each of the grade's lines that is not yet an objective, written by the skill (machine-made, undoable)."""
    _needs_by(write, by)
    skill = skill_spec.read(settings.SEED / "skills" / SKILL)
    with db.connect() as conn:
        t = _tenant(conn)
        which = [grade] if grade else lo_write.grades(conn, t)
        pools = {g: lo_write.pool(conn, t, g) for g in which}
        todo = [j for g in which for j in lo_write.jobs(conn, t, g, skill["lists"])]
        todo = todo[:limit] if limit else todo
        f = lo_write.forecast(conn, skill, todo, pools)
        typer.echo(
            f"{', '.join(which) or 'no grade'}: {f.rows} lines to write as {f.jobs} jobs; about {f.calls:.0f} calls, about ₹{f.inr:.0f}"
            f" (₹{f.nearest_inr:.1f} of it the nearest-objective lists), at most ₹{f.worst_inr:.0f} if every job"
            f" is retried; the run stops at ₹{CEILING * f.inr:.0f} ({CEILING}x)"
        )
        if estimate_only or not todo:
            return
        staff_of(conn, by) if write else None
        ceiling = CEILING * f.inr
        ask = spend.capped(
            machines.model_ask(conn, None, stage), conn, {SKILL: skill}, ceiling, spend.started(conn)
        )
        done = lo_write.run(
            skill, todo, pools, ask, after=lambda _j: conn.commit()
        )  # a job's flow_run rows, kept
        refused: dict[str, int] = {}
        for _j, faults in done.refused:
            refused[lo_write.cause(faults)] = refused.get(lo_write.cause(faults), 0) + 1
        typer.echo(
            f"{len(done.written)} written, {len(done.repeats)} repeats ({', '.join(f'{j["key"]} of {c}' for j, c in done.repeats)}),"
            f" {len(done.refused)} refused {refused or ''}; {len(todo) - len(done.written) - len(done.repeats) - len(done.refused)} not reached"
            + (f"; stopped: {done.stopped}" if done.stopped else "")
        )
        for j, faults in done.refused:
            typer.echo(f"  refused {j['key']}: {lo_write.cause(faults)}")
        if not write:
            typer.echo("(dry: nothing recorded)")
            conn.commit()
            return
        rep, run = lo_write.apply(conn, t, done, by)
        typer.echo(f"applied: {rep.counts() or 'nothing new'}, skipped {rep.skipped}; run {run}")
        conn.commit()
