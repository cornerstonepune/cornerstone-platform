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
        goods = settings.config(conn, f"skill_goods.{name}") or {}
        by = evals.calls(skill, split, goods)
        rupees = sum(_price(conn, skill, p, n, p.endswith(".validate")) for p, n in by.items())
        typer.echo(f"{name}: {sum(by.values())} calls at most, about ₹{rupees:.0f} ({json.dumps(by)})")
        if estimate_only:
            return True
        scores = evals.evaluate(
            skill, machines.model_ask(conn, version or skill["version"]), conn, split, goods
        )
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
    if (
        name == "all" and split != "all"
    ):  # a skill with no case in this half has nothing to score: say so, don't fail it
        for s in [s for s in todo if not evals.cases(s, "gold.json", split)]:
            typer.echo(f"{s['name']}: no {split} cases yet, skipped")
        todo = [s for s in todo if evals.cases(s, "gold.json", split)]
    met = [_run(s, estimate_only, version, split) for s in todo]
    if not all(met):
        raise typer.Exit(1)


@skill_app.command("seed-goods")
def seed_goods(
    name: str = typer.Argument(..., help="a WRITE skill whose gold cases have no answer yet"),
    estimate_only: bool = typer.Option(False, "--estimate", help="count the calls and price them; no call"),
    version: int = typer.Option(0, "--version", help="the prompt version that writes (0: the file's)"),
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
        rupees = sum(_price(conn, skill, p, k, p.endswith(".validate")) for p, k in by.items())
        typer.echo(
            f"{name}: {n} cases without an answer, {sum(by.values())} calls at most, about ₹{rupees:.0f}"
        )
        if estimate_only or not n:
            return
        ask = machines.model_ask(conn, version or skill["version"])
        refused: list[str] = []
        for c in todo:
            got = machines.write(skill, c["input"], ask, about=c["id"])
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
    typer.echo(f"  kept {len(todo) - len(refused)} of {n}; refused {len(refused)}: {', '.join(refused[:10])}")
