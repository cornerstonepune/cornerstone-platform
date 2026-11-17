"""`engine curriculum chain-draft` (CP-54 B4, no model): what code alone decides about the chain from an LO to the child:
counts and, for the LOs the spine gives several capabilities, the shortlist file the model step reads. Writes no row.
`--sql` prints the four counts as SELECTs to count on a database this command does not connect to."""

import json
from pathlib import Path

import typer

from engine.core import db, settings
from engine.w1_bank import (
    chain_draft,
    cli_counts,  # noqa: F401 — registers `curriculum counts`
)
from engine.w1_bank.k2_upload import curriculum_app

SHORTLIST = db.REPO_ROOT / "data" / "chain" / "capability_shortlist.json"
OUT = SHORTLIST  # the folder of the files is OUT.parent


@curriculum_app.command("chain-draft")
def chain_draft_(
    sql: bool = typer.Option(False, "--sql", help="print the four counts as SELECTs and stop"),
    out: Path = typer.Option(SHORTLIST, "--shortlist", help="where the model step's shortlist is written"),
) -> None:
    """Count what code decides: LOs to rewrite, capability by the spine, engine skill -> LO, topics by exact unit name."""
    with db.connect() as conn:
        if sql:
            for name, query in chain_draft.sql_all(chain_draft.rules(conn)).items():
                typer.echo(f"-- {name}\n{query};")
            return
        tenant = db.one(conn, "select id from tenant where slug = %s", (db.tenant_slug(),))["id"]
        got = chain_draft.counts(conn, tenant)
    short = got.pop("shortlist")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(short, indent=1))
    for band, kinds in sorted(got["rewrite"].items()):
        total = sum(kinds.values())
        typer.echo(f"  {band}: {total} LOs; {kinds.get('observable', 0)} read as something a child does; "
                   f"to rewrite or fold: " + ", ".join(f"{k} {n}" for k, n in sorted(kinds.items()) if k != "observable"))  # fmt: skip
    c = got["capability"]
    typer.echo(
        f"  capability by the spine: {c['one']} LOs one answer, {c['several']} several (shortlist: {out})"
    )
    t = got["tests"]
    typer.echo(
        f"  engine skill -> LO: {t['one']} skills exactly one LO, {t['several']} several, {t['none']} none"
    )
    typer.echo(f"  topics by exact unit name: {got['topics']} LOs")


def _cost(conn: db.Conn, jobs: list[dict]) -> tuple[int, float, float]:
    """(model calls, rupees, dollars) a list of jobs would cost: each job's frame, standard and inputs in, a short answer out, a
    WRITE job also read once by its validator and retried one time in five. A job code answers itself costs nothing
    (`chain_choose.asks`). Estimated from the prices row, no call."""
    from engine.core import skill_spec
    from engine.w1_bank import chain_choose

    jobs = [j for j in jobs if chain_choose.asks(j)]

    prices = settings.config(conn, "llm.prices") or {}
    rate = float((settings.config(conn, "llm.campaigns") or {}).get("cp-54", {}).get("inr_per_usd", 88))
    calls, inr = 0, 0.0
    for kind in {j["skill"] for j in jobs}:
        s = skill_spec.read(settings.SEED / "skills" / kind)
        mine = [j for j in jobs if j["skill"] == kind]
        base = len(s["standard"]) + 1500
        for model, factor, out_tokens, share in (
            (
                s["writer_model"],
                1.0 if s["mode"] == "choose" else 1.2,
                120 if s["mode"] == "choose" else 250,
                1,
            ),
            (s["validator_model"], 1.2, 150, 0 if s["mode"] == "choose" else 1),
        ):
            if not share:
                continue
            p = prices.get(model, {"in": 0, "out": 0})
            for j in mine:
                tokens_in = (base + len(str(j["inputs"])) + len(str(j["options"]))) / 3.5
                inr += factor * (tokens_in * p["in"] + out_tokens * p["out"]) / 1_000_000
                calls += int(factor + 0.99)
    return calls, inr, inr / rate


def _stage_by(conn: db.Conn, write: bool, by: str) -> None:
    from engine.w1_bank.cli_map import _needs_by, staff_of

    _needs_by(write, by)
    if write:
        staff_of(conn, by)  # refuses an email no one has


@curriculum_app.command("chain-link")
def chain_link(
    kind: str = typer.Argument(..., help="capability | skill_lo | topic"),
    estimate_only: bool = typer.Option(
        False, "--estimate", help="build every input, count the calls and price them; no call"
    ),
    write: bool = typer.Option(
        False,
        "--apply",
        help="apply the answers as the machine's; without it they are only written to data/chain",
    ),
    by: str = typer.Option("", "--by", help="the email of the member of staff running it"),
    stage: str = typer.Option("draft", "--stage", help="the cp-54 campaign's stage that pays"),
    limit: int = typer.Option(0, "--limit", help="ask about this many only (a probe); 0 is every one"),
) -> None:
    """Make the chain's missing links with the skills' machines: each answer a row of the seed files' form, never empty."""
    from engine.skills import machines
    from engine.w1_bank import apply_seed, chain_choose

    if kind not in chain_choose.KINDS:
        raise typer.BadParameter(f"kind is one of {', '.join(chain_choose.KINDS)}")
    with db.connect() as conn:
        _stage_by(conn, write, by)
        tenant = db.one(conn, "select id from tenant where slug = %s", (db.tenant_slug(),))["id"]
        jobs, folded = chain_choose.plan(conn, tenant, kind)
        jobs = jobs[:limit] if limit else jobs
        calls, rupees, dollars = _cost(conn, jobs)
        coded = sum(not chain_choose.asks(j) for j in jobs)
        typer.echo(
            f"{kind}: {len(jobs)} to answer, {coded} of them by code with no call, {len(folded)} folded by code;"
            f" about {calls} calls, about ${dollars:.2f} (₹{rupees:.0f})"
        )
        if estimate_only:
            return
        answers = chain_choose.run(conn, tenant, kind, jobs, machines.model_ask(conn, None, stage))
        rows = folded + answers
        look = chain_choose.disagreements(kind, jobs, answers)
        settings.put(
            conn,
            f"chain_disagreements.{kind}",
            look,
            description="CP-54: the answers to check first, by the machine's own doubt",
        )
        OUT.parent.mkdir(parents=True, exist_ok=True)
        file = OUT.parent / f"{kind}.json"
        file.write_text(json.dumps({"rows": rows}, indent=1, ensure_ascii=False))
        low = sum(r.get("confidence") == "low" for r in rows)
        typer.echo(f"  {len(rows)} answers ({low} low confidence) written to {file}")
        typer.echo(f"  {len(look)} to check first, in the setting chain_disagreements.{kind}")
        if write:
            rep, run = apply_seed.apply_rows(conn, tenant, kind, rows, by)
            typer.echo(
                f"  applied: {rep.counts() or 'nothing new'}, {len(rep.rejected)} rejected, skipped {rep.skipped}; run {run}"
            )
        conn.commit()  # the answers, and the flow_run rows of what was spent
