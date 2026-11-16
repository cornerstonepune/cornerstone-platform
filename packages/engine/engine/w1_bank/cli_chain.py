"""`engine curriculum chain-draft` (CP-54 B4, no model): what code alone decides about the chain from an LO to the child:
counts and, for the LOs the spine gives several capabilities, the shortlist file the model step reads. Writes no row.
`--sql` prints the four counts as SELECTs to count on a database this command does not connect to."""

import json
from pathlib import Path

import typer

from engine.core import db
from engine.w1_bank import chain_draft
from engine.w1_bank.k2_upload import curriculum_app

SHORTLIST = db.REPO_ROOT / "data" / "chain" / "capability_shortlist.json"


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
