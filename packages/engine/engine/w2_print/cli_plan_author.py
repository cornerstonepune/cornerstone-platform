"""`engine timetable author`: every planner line the matching run answered none, settled (CP-52, `plan_author.py`):
routine with no activity, or a new activity of the machine's linked by model. `--estimate` counts by kind and prices
the model's share with no call; `--gold` scores the classifier on the school's 40 exact links (every one a taught
activity) and settles nothing; `--apply --by` settles and prints the run to undo (`engine timetable link-undo`)."""

import uuid

import typer

from engine.adapters import llm, llm_budget
from engine.core import db
from engine.w2_print import plan_author as pa
from engine.w2_print import plan_match
from engine.w2_print.cli_plan_link import BAND, _band


def _ask(conn: db.Conn, version: int, stage: str | None) -> pa.Ask:
    def ask(variables: dict[str, object], about: str) -> dict[str, object]:
        return llm.generate(conn, pa.PURPOSE, variables, version=version, stage=stage, about=about)

    return ask


def _price(conn: db.Conn, calls: int) -> str:
    got = db.one(
        conn,
        "select count(*) as n, avg(cost_inr) as inr from flow_run where flow = any(%s) and cost_inr is not null",
        ([pa.PURPOSE, plan_match.PURPOSE],),
    )
    each = f"about ₹{calls * float(got['inr']):.0f}" if got["n"] else "no call of this size paid for yet"
    status = llm_budget.line(llm_budget.status(conn, db.tenant_slug(), pa.PURPOSE, None))
    return f"{calls} model calls, {each}; campaign: {status}"


def author(
    apply: bool = typer.Option(False, "--apply", help="settle the lines (needs --by)"),
    by: str = typer.Option("", "--by", help="the member of staff running it, by email (kept as an id)"),
    band: str | None = BAND,
    version: int = typer.Option(1, "--version", help="the classifier's prompt version"),
    stage: str = typer.Option("", "--stage", help="the campaign stage that pays for the calls"),
    gold: bool = typer.Option(
        False, "--gold", help="classify the school's exact links (all teaching); settle nothing"
    ),
    estimate: bool = typer.Option(False, "--estimate", help="count by kind and price; no call"),
) -> None:
    """CP-52: each line the matching run answered none: routine (no activity), or a new activity of the machine's."""
    if apply and (gold or not by.strip()):
        raise typer.BadParameter("--apply needs --by, and is never a --gold run")
    with db.connect() as conn:
        tenant = db.one(conn, "select id from tenant where slug = %s", (db.tenant_slug(),))["id"]
        band = _band(conn, band)
        todo = (
            [pa.Gap(x.key, x.text, x.ids) for x in plan_match.lines(conn, tenant, band, gold=True)]
            if gold
            else pa.gaps(conn, tenant, band)
        )
        by_code = [g for g in todo if pa.routine(conn, g)]
        typer.echo(
            f"{band}: {len(todo)} lines, {len(by_code)} routine by code; {_price(conn, len(todo) - len(by_code))}"
        )
        if estimate:
            return
        staff = db.one(conn, "select public.staff_of_email(%s) as id", (by,))["id"] if apply else None
        if apply and staff is None:
            raise typer.BadParameter("no one member of staff has the email given to --by")
        ask, run, made = _ask(conn, version, stage or None), uuid.uuid4(), []
        for g in todo:
            try:
                v = pa.classify(conn, g, ask, version)
            except llm.LLMSchemaError as e:
                v = pa.Verdict(None, f"{pa.PURPOSE} v{version}", problems=[f"reply refused: {e}"])
            code = pa.settle(conn, tenant, run, g, v, staff, f"machine:{pa.PURPOSE}", band) if apply else None
            made.append((v, code))
            typer.echo(f"  {g.key}: {g.text[:60]!r} -> {v.kind or 'refused'} {code or ''} {v.problems or ''}")
        kinds = {k: sum(v.kind == k for v, _ in made) for k in (*pa.KINDS, None)}
        typer.echo(
            f"{len(made)} lines: {kinds['teaching']} teaching, {kinds['routine']} routine, {kinds[None]} refused"
        )
        if gold:
            typer.echo(
                f"gold: {kinds['teaching']} of {len(made)} of the school's taught lines called teaching"
            )
        conn.commit()  # the proposals, the new activities and the links; and the flow_run rows: what was spent
        typer.echo(
            f"run {run} (undo the links: engine timetable link-undo {run})"
            if apply
            else "dry run: nothing settled"
        )


def mount(app: typer.Typer) -> None:
    app.command("author")(author)
