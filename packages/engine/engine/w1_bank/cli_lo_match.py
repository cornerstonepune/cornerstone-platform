"""`engine curriculum lo-match`: each objective no activity ties to one skill, matched by a model to one shortlisted
skill, or none (CP-51, `lo_match.py`). `--estimate` counts and prices with no call; `--gold` scores the prompt against the
school's own single links and writes nothing but what it cost; `--apply --by` records the answers as proposals, which
`engine curriculum apply --kind lo_skill` then links as the machine's (each undone by `engine curriculum revert`)."""

import uuid

import typer

from engine.adapters import llm, llm_budget
from engine.core import db
from engine.w1_bank import lo_match
from engine.w1_bank.cli_map import APPLY, BY, _needs_by, _tenant, staff_of
from engine.w1_bank.k2_upload import config, curriculum_app


def _ask(conn: db.Conn, version: int | None, stage: str | None) -> lo_match.Ask:
    def ask(variables: dict[str, object], about: str) -> dict[str, object]:
        return llm.generate(conn, lo_match.PURPOSE, variables, version=version, stage=stage, about=about)

    return ask


def campaign(conn: db.Conn) -> str:
    """Where the purpose's campaign stands, in dollars, as one line."""
    return llm_budget.line(llm_budget.status(conn, db.tenant_slug(), lo_match.PURPOSE, None))


def price(conn: db.Conn, calls: int) -> str:
    """About what `calls` calls cost in rupees, from what this purpose has cost a call so far, or, before its first
    paid call, the plan-line match (one Sonnet call over a shortlist of the same size)."""
    rows = {
        r["flow"]: r
        for r in conn.execute(
            "select flow, count(*) as n, avg(cost_inr) as inr from flow_run where flow = any(%s)"
            " and cost_inr is not null group by flow",
            ([lo_match.PURPOSE, "plan_line_match"],),
        ).fetchall()
    }
    got = rows.get(lo_match.PURPOSE) or rows.get("plan_line_match")
    if got is None:
        return f"{calls} calls; no call of this size has been paid for yet"
    each = float(got["inr"])
    return (
        f"{calls} calls, about ₹{calls * each:.0f} (₹{each:.2f} a call over {got['n']} {got['flow']} calls)"
    )


@curriculum_app.command("lo-match")
def lo_match_(
    band: str = typer.Option(
        "", "--band", help="Default: the band of the K2 sheet (supabase/seed/k2_sheet.json)"
    ),
    write: bool = APPLY,
    by: str = BY,
    version: int = typer.Option(0, "--version", help="the prompt version (0: the active one)"),
    stage: str = typer.Option("", "--stage", help="the campaign stage that pays for the calls"),
    gold: bool = typer.Option(
        False, "--gold", help="ask about the school's own single links and score; links nothing"
    ),
    estimate_only: bool = typer.Option(False, "--estimate", help="count and price; no call"),
) -> None:
    """CP-51: each objective with no skill, matched by a model to one shortlisted skill, or none."""
    _needs_by(write, by)
    if write and gold:
        raise typer.BadParameter("--apply is never a --gold run")
    with db.connect() as conn:
        tenant, b = _tenant(conn), band or config()["band"]
        todo = lo_match.objectives(conn, tenant, b, gold=gold)
        calls = sum(bool(lo_match.shortlist(conn, tenant, b, o)) for o in todo)
        typer.echo(
            f"{b}: {len(todo)} objectives, {calls} with a shortlist; {price(conn, calls)}; {campaign(conn)}"
        )
        if estimate_only:
            return
        staff = staff_of(conn, by) if write else None
        ask, run, made = _ask(conn, version or None, stage or None), uuid.uuid4(), []
        prompt = f"{lo_match.PURPOSE} v{version or 'active'}"
        for o in todo:
            try:
                a = lo_match.answer(conn, tenant, b, o, ask)
            except llm.LLMSchemaError as e:
                a = lo_match.Answer(
                    o, lo_match.shortlist(conn, tenant, b, o), problems=[f"reply refused: {e}"]
                )
            made.append(a)
            typer.echo(f"  {o.code} -> {a.skill or 'none'} {a.problems or ''}")
            if write and staff is not None:
                lo_match.record(conn, tenant, run, a, staff, prompt)
        if gold:
            typer.echo(f"gold: {lo_match.score(made, lo_match.gold_links(conn, tenant, b))}")
        else:
            chosen = sum(a.skill is not None for a in made)
            typer.echo(f"{len(made)} objectives: {chosen} matched, {sum(not a.skill and not a.problems for a in made)}"
                       f" none (a person chooses), {sum(bool(a.problems) for a in made)} refused")  # fmt: skip
        conn.commit()  # the proposals, and the flow_run rows: what was spent
        typer.echo(
            f"campaign after: {campaign(conn)}; run {run}" + ("" if write else " (dry: nothing recorded)")
        )
