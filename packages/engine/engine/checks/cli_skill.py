"""`engine skill …` (CP-54 B2): the skills, what each replaces, and `engine skill eval <name>`, which scores one against
its bars (rows `skill_bar.<name>.*`) with the model, recording what it spent in `flow_run` against the CP-54 campaign."""

import json

import typer

from engine.checks import bars
from engine.core import db, settings, skill_spec
from engine.skills import evals, machines

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


def _price(conn: db.Conn, skill: dict, purpose: str, n: int, validator: bool) -> float:
    model = skill["validator_model"] if validator else skill["writer_model"]
    measured = (settings.config(conn, "skill.measured_inr_per_call") or {}).get(model)
    if measured is not None:  # what a call of this model really cost in flow_run beats a count of tokens
        return n * float(measured)
    prices = settings.config(conn, "llm.prices") or {}
    p = prices.get(model, {"in": 0, "out": 0})
    tokens_in = (len(skill["standard"]) + 1500) / 3.5 + 600  # the frame, the standard, the case
    return n * (tokens_in * p["in"] + 400 * p["out"]) / 1_000_000


def _run(skill: dict, estimate_only: bool, version: int, split: str) -> bool:
    """One skill's eval; True when it met every bar (or, for an estimate, was only counted)."""
    name = skill["name"]
    with db.connect() as conn:
        by = evals.calls(skill, split)
        rupees = sum(_price(conn, skill, p, n, p.endswith(".validate")) for p, n in by.items())
        typer.echo(f"{name}: {sum(by.values())} calls at most, about ₹{rupees:.0f} ({json.dumps(by)})")
        if estimate_only:
            return True
        scores = evals.evaluate(skill, machines.model_ask(conn, version or skill["version"]), conn, split)
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
    name: str = typer.Argument(..., help="the skill's name, or `all` for every skill"),
    estimate_only: bool = typer.Option(False, "--estimate", help="count the calls and price them; no call"),
    version: int = typer.Option(0, "--version", help="the prompt version to score (0: the file's)"),
    split: str = typer.Option(
        "held", "--split", help="which cases: held (only these score a skill), tune, or all"
    ),
) -> None:
    """Score a skill against its gold, its planted-bad set, a smoke run and the prompt it replaces; exit 1 below any bar."""
    todo = list(_all().values()) if name == "all" else [_one(name)]
    if split not in ("held", "tune", "all"):
        raise typer.BadParameter("--split is held, tune or all")
    met = [_run(s, estimate_only, version, split) for s in todo]
    if not all(met):
        raise typer.Exit(1)
