"""`engine curriculum stmt-match`: each outside statement held by a model against the school's objectives, any grade
(CP-54, `stmt_match.py`). `--estimate` counts and prices with no call; `--gold` scores the prompt against the earlier
machine links (a reference, never a gold) and writes nothing but what it cost; `--sample N` asks N askable statements,
spread by a fixed hash, and writes nothing; `--apply --by` writes the matches as machine links of one run, which
`--revert RUN` undoes.

The log of a run on the server is public, so it prints codes and counts only, never a statement's words or a model's
reason (a framework's words may not be republished); the replies themselves are kept on the run's `flow_run` rows."""

import uuid

import typer

from engine.adapters import llm, llm_budget
from engine.core import db
from engine.w1_bank import stmt_match as sm
from engine.w1_bank.cli_map import APPLY, BY, _needs_by, _tenant, staff_of
from engine.w1_bank.k2_upload import curriculum_app


def _ask(conn: db.Conn, version: int | None, stage: str | None) -> sm.Ask:
    def ask(variables: dict[str, object], about: str) -> dict[str, object]:
        return llm.generate(conn, sm.PURPOSE, variables, version=version, stage=stage, about=about)

    return ask


def _answer(conn: db.Conn, st: sm.Statement, los: list[sm.Objective], ask: sm.Ask) -> sm.Answer:
    """The model's answer for one statement; a reply off its schema is a refusal, kept with its shortlist."""
    try:
        return sm.answer(conn, st, los, ask)
    except llm.LLMSchemaError as e:
        return sm.Answer(st, sm.shortlist(conn, st, los), asked=True, problems=[f"reply refused: {e}"])


def spread(items: list[sm.Statement], n: int) -> list[sm.Statement]:
    """`n` of them chosen by a fixed hash, so every run asks the same ones."""
    return sorted(
        items, key=lambda s: (uuid.uuid5(uuid.NAMESPACE_OID, f"{s.framework}/{s.code}").hex, s.code)
    )[:n]


def gold_scores(version: int = 0, stage: str = "") -> dict[str, float]:
    """`engine eval statement_match`: the prompt against the statements the earlier machine links already hold; links
    nothing and records only what it cost. Its bars are the rows `eval.statement_match.*`."""
    with db.connect() as conn:
        tenant = _tenant(conn)
        los, held = sm.objectives(conn, tenant), sm.held_by(conn, tenant)
        ask = _ask(conn, version or None, stage or None)
        made = [_answer(conn, s, los, ask) for s in sm.statements(conn, tenant, reference=True)]
        scores = sm.score(made, held)
        conn.commit()  # the flow_run rows: what the eval spent
    return scores


def campaign(conn: db.Conn) -> str:
    return llm_budget.line(llm_budget.status(conn, db.tenant_slug(), sm.PURPOSE, None))


def price(conn: db.Conn, calls: int) -> str:
    """About what `calls` calls cost in rupees, from what this purpose has cost a call so far, else the objective match's."""
    rows = {
        r["flow"]: r
        for r in conn.execute(
            "select flow, count(*) as n, avg(cost_inr) as inr from flow_run where flow = any(%s)"
            " and cost_inr is not null group by flow",
            ([sm.PURPOSE, "lo_skill_match"],),
        ).fetchall()
    }
    got = rows.get(sm.PURPOSE) or rows.get("lo_skill_match")
    if got is None:
        return f"{calls} calls; no call of this size has been paid for yet"
    each = float(got["inr"])
    return (
        f"{calls} calls, about ₹{calls * each:.0f} (₹{each:.2f} a call over {got['n']} {got['flow']} calls)"
    )


@curriculum_app.command("stmt-match")
def stmt_match_(
    framework: str = typer.Option("", "--framework", help="Only this framework's statements"),
    write: bool = APPLY,
    by: str = BY,
    version: int = typer.Option(0, "--version", help="the prompt version (0: the active one)"),
    stage: str = typer.Option("", "--stage", help="the campaign stage that pays for the calls"),
    gold: bool = typer.Option(False, "--gold", help="score against the earlier machine links; links nothing"),
    sample: int = typer.Option(0, "--sample", help="ask only this many askable statements; links nothing"),
    revert: str = typer.Option("", "--revert", help="undo every link of this run id"),
    estimate_only: bool = typer.Option(False, "--estimate", help="count and price; no call"),
) -> None:
    """CP-54: each outside statement held against the school's objectives of any grade, or none."""
    _needs_by(write, by)
    if write and (gold or sample):
        raise typer.BadParameter("--apply is never a --gold or --sample run")
    with db.connect() as conn:
        tenant = _tenant(conn)
        if revert:
            typer.echo(f"{sm.revert(conn, tenant, uuid.UUID(revert))} links of run {revert} undone")
            conn.commit()
            return
        if gold:
            scores = gold_scores(version, stage)
            typer.echo(f"gold (a reference, not a gold): {scores}")
            return
        los = sm.objectives(conn, tenant)
        todo = sm.statements(conn, tenant, framework)
        askable = [
            s
            for s in todo
            if (sl := sm.shortlist(conn, s, los)) and sl[0][1] >= sm.size(conn, "stmt.min_shared", 2)
        ]
        if sample:
            todo = spread(askable, sample)
        typer.echo(
            f"{len(todo)} statements, {len(askable)} askable of {len(sm.statements(conn, tenant, framework))};"
            f" {price(conn, len(askable) if not sample else len(todo))}; {campaign(conn)}"
        )
        if estimate_only:
            return
        staff = staff_of(conn, by) if write else None
        ask, run, made, links = _ask(conn, version or None, stage or None), uuid.uuid4(), [], 0
        for s in todo:
            a = _answer(conn, s, los, ask)
            made.append(a)
            typer.echo(
                f"  {s.framework} {s.code} -> "
                + (", ".join(f"{m.code} {m.relation}" for m in a.matches) or "none")
                + (f" {a.problems}" if a.problems else "")
            )
            if write and staff is not None:
                links += sm.record(conn, tenant, run, a)
            conn.commit()  # each answer's flow_run row, so an interrupted run keeps what it spent
        typer.echo(
            f"{len(made)} statements: {sum(bool(a.matches) for a in made)} matched, "
            f"{sum(not a.matches and not a.problems for a in made)} none, {sum(bool(a.problems) for a in made)} refused; "
            f"{links} links made; campaign after: {campaign(conn)}; run {run}"
            + ("" if write else " (dry: nothing recorded)")
        )
