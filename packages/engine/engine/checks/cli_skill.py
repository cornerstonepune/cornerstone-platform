"""`engine skill …` (CP-54 B2): the skills, what each replaces, and `engine skill eval <name>`, which scores one against
its bars (rows `skill_bar.<name>.*`) with the model, recording what it spent in `flow_run` against the CP-54 campaign."""

import json

import typer

from engine.checks import bars
from engine.core import db, settings, skill_spec
from engine.skills import evals, machines, spend

skill_app = typer.Typer(help="The skills that make every curriculum artefact", no_args_is_help=True)


def _all() -> dict[str, dict]:
    return {p.name: skill_spec.read(p) for p in skill_spec.folders(settings.SEED / "skills")}


def _one(name: str) -> dict:
    found = _all()
    if name not in found:
        raise typer.BadParameter(f"no skill {name!r}; the skills are {', '.join(found)}")
    return found[name]


@skill_app.command("list")
def list_() -> None:
    """Each skill: its machine, its models, whether its prompts are active, what it replaces."""
    for s in _all().values():
        old = (s.get("replaces") or {}).get("purposes") or []
        typer.echo(
            f"  {s['name']:<20} {s['mode']:<7} v{s['version']}  {s['writer_model']} / {s['validator_model']}"
            f"  {'ACTIVE' if s.get('active') else 'not active'}  replaces: {', '.join(old) or 'nothing'}"
        )


@skill_app.command("map")
def map_() -> None:
    """Old prompt purpose -> the skill that replaces it, and whether it is retired (only when the skill scored at least as well)."""
    for s in _all().values():
        r = s.get("replaces") or {}
        for old in r.get("purposes") or []:
            typer.echo(
                f"  {old:<26} -> {s['name']:<20} {'RETIRED' if old in (r.get('retired') or []) else 'still in use'}"
            )


def _run(
    skill: dict, estimate_only: bool, version: int, split: str, ceiling: tuple[float, float] | None = None
) -> bool:
    """One skill's eval; True when it met every bar (or, for an estimate, was only counted)."""
    name = skill["name"]
    with db.connect() as conn:
        goods = settings.config(conn, f"skill_goods.{name}") or {}
        by = evals.calls(skill, split, goods)
        rupees = sum(spend.price(conn, skill, p.endswith(".validate"), n) for p, n in by.items())
        typer.echo(f"{name}: {sum(by.values())} calls at most, about ₹{rupees:.0f} ({json.dumps(by)})")
        if estimate_only:
            return True
        ask = machines.model_ask(conn, version or skill["version"])
        if ceiling:  # the run's rupee ceiling: the engine refuses the call that would cross it
            ask = spend.capped(ask, conn, _all(), ceiling[0], ceiling[1])
        try:
            scores = evals.evaluate(skill, ask, conn, split, goods)
        except spend.SpendStop:
            conn.commit()  # what was spent before the stop is on record
            raise
        conn.commit()  # the flow_run rows: what the eval spent
        held = settings.numbers(conn, f"skill_bar.{name}.")
    typer.echo("  " + "  ".join(f"{k} {v:.3f}" for k, v in scores.items()))
    missed = bars.short(scores, held)
    for m in missed:
        typer.echo(f"  BELOW  skill.{name}: {m}", err=True)
    if not missed:
        typer.echo(f"  skill.{name}: every bar met")
    return not missed


@skill_app.command("eval")
def eval_(
    name: str = typer.Argument(
        ..., help="a skill's name, several joined by commas, or `all` for every skill"
    ),
    estimate_only: bool = typer.Option(False, "--estimate", help="count the calls and price them; no call"),
    version: int = typer.Option(0, "--version", help="the prompt version to score (0: the file's)"),
    split: str = typer.Option(
        "held", "--split", help="which cases: held (only these score a skill), tune, or all"
    ),
    max_inr: float = typer.Option(
        0,
        "--max-inr",
        help="a ceiling in rupees for the whole run (0: none); a call that could cross it is not made",
    ),
) -> None:
    """Score a skill against its gold, its planted-bad set, a smoke run and the prompt it replaces; exit 1 below any bar."""
    todo = list(_all().values()) if name == "all" else [_one(n.strip()) for n in name.split(",")]
    if split not in ("held", "tune", "all"):
        raise typer.BadParameter("--split is held, tune or all")
    if (
        name == "all" and split != "all"
    ):  # a skill with no case in this half has nothing to score: say so, don't fail it
        for s in [s for s in todo if not evals.cases(s, "gold.json", split)]:
            typer.echo(f"{s['name']}: no {split} cases yet, skipped")
        todo = [s for s in todo if evals.cases(s, "gold.json", split)]
    ceiling = None
    if max_inr and not estimate_only:
        with db.connect() as conn:
            ceiling = (max_inr, spend.started(conn))
    met: list[bool] = []
    try:
        for s in todo:
            met.append(_run(s, estimate_only, version, split, ceiling))
    except spend.SpendStop as e:
        left = [s["name"] for s in todo[len(met) :]]
        typer.echo(f"  STOPPED at the ceiling, not scored: {', '.join(left)} ({e})", err=True)
        raise typer.Exit(1) from e
    if not all(met):
        raise typer.Exit(1)


@skill_app.command("seed-goods")
def seed_goods(
    name: str = typer.Argument(..., help="a WRITE skill whose gold cases have no answer yet"),
    estimate_only: bool = typer.Option(False, "--estimate", help="count the calls and price them; no call"),
    version: int = typer.Option(0, "--version", help="the prompt version that writes (0: the file's)"),
    max_inr: float = typer.Option(
        0,
        "--max-inr",
        help="a ceiling in rupees for the run (0: none); a call that could cross it is not made",
    ),
) -> None:
    """The engine writes the answer each gold case lacks. Only an answer that passes every code rule and the validator is
    kept, in the setting `skill_goods.<name>` (machine-made: the coordinators' weekly check starts with them); the
    gold's `clean` measure and the planted-bad set read them. A case that refuses stays without an answer."""
    skill = _one(name)
    if skill["mode"] != "write":
        raise typer.BadParameter(
            f"{name} is a CHOOSE skill: its gold cases already hold the coordinator's choice"
        )
    with db.connect() as conn:
        kept = settings.config(conn, f"skill_goods.{name}") or {}
        todo = [c for c in evals.cases(skill, "gold.json") if "good" not in c and c["id"] not in kept]
        n = len(todo)
        by = {
            skill_spec.purpose(name): n * 2,
            skill_spec.purpose(name, True): n * 2,
        }  # a retry doubles the worst case
        rupees = sum(spend.price(conn, skill, p.endswith(".validate"), k) for p, k in by.items())
        typer.echo(
            f"{name}: {n} cases without an answer, {sum(by.values())} calls at most, about ₹{rupees:.0f}"
        )
        if estimate_only or not n:
            return
        ask = machines.model_ask(conn, version or skill["version"])
        if max_inr:
            ask = spend.capped(ask, conn, {name: skill}, max_inr, spend.started(conn))
        refused: list[str] = []
        stopped: list[str] = []
        for c in todo:
            try:
                got = machines.write(skill, c["input"], ask, about=c["id"])
            except spend.SpendStop:
                conn.commit()  # what the stopped case had already spent is on record
                stopped = [
                    x["id"] for x in todo[todo.index(c) :]
                ]  # this case and every one after it stay unanswered
                break
            if got.status == "ok" and got.output is not None:
                kept[c["id"]] = got.output
                settings.put(
                    conn,
                    f"skill_goods.{name}",
                    kept,
                    description="CP-54: machine-made answers the gold cases lacked",
                )
            else:
                refused.append(c["id"])
            conn.commit()  # the flow_run rows, and every answer kept so far, survive a stop
    done = n - len(refused) - len(stopped)
    typer.echo(f"  kept {done} of {n}; refused {len(refused)}: {', '.join(refused[:10])}")
    if stopped:
        typer.echo(
            f"  STOPPED at the ceiling of ₹{max_inr:.0f}: {len(stopped)} cases left without an answer",
            err=True,
        )
        typer.echo(f"  left: {', '.join(stopped)}")
