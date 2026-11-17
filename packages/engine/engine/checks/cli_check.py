"""The commands that prove things: `engine audit` (every invariant), `engine promises`, `engine ratchet` and the
rest. Their own module so `cli.py` stays under the ceiling."""

import sys

import typer

from engine.checks import audit as audit_module
from engine.checks import chain
from engine.checks.links import links_app
from engine.checks.past import past
from engine.core import db
from engine.w1_bank import spec


def _say(line: str, err: bool = False) -> None:
    """Echo and flush. An audit takes minutes and its output is usually piped into a log or a CI step;
    without the flush a person watching sees nothing until the whole run ends and assumes it hung."""
    typer.echo(line, err=err)
    (sys.stderr if err else sys.stdout).flush()


def register(app: typer.Typer) -> None:
    app.command()(audit)
    app.command()(promises)
    app.command()(ratchet)
    app.command()(slices)
    app.command()(past)
    app.command("chain")(chain.command)
    spec_app = typer.Typer(help="The skill-set specs, as a person reads them", no_args_is_help=True)
    spec_app.command("outcomes")(outcomes)
    app.add_typer(spec_app, name="spec")
    app.add_typer(links_app, name="links")


def outcomes() -> None:
    """Is every skill stated as what the child can do? One line per skill; exits 1 if any is not."""
    with db.connect() as conn:
        rows = spec.outcomes(conn)
    good = 0
    for code, text, problems in rows:
        good += not problems
        _say(f"  {'ok  ' if not problems else 'FAIL'}  {code:<20} {text}")
        for p in problems:
            _say(f"          {p}", err=True)
    _say(f"  {good} of {len(rows)} read as outcomes")
    if good < len(rows):
        raise typer.Exit(1)


def audit() -> None:
    """Every invariant the rows must satisfy, in one sweep. Exits 1 on any violation."""
    bad = checked = 0
    with db.connect() as conn:
        # each said as it finishes: the sweep takes minutes on live
        for name, violations in audit_module.each(conn):
            _say(
                f"  {'FAIL' if violations else 'ok  '}  {name}"
                + (f"  → {len(violations)}" if violations else "")
            )
            for v in violations[:10]:
                _say(f"          {v}", err=True)
            if len(violations) > 10:
                _say(f"          … and {len(violations) - 10} more", err=True)
            bad += len(violations)
            checked += 1
    _say(f"  {checked} invariants checked, {bad} violations")
    if bad:
        raise typer.Exit(1)


def ratchet(base: str = typer.Option(..., help="The commit whose baselines this one may not loosen")) -> None:
    """The baselines only tighten: the frozen files and functions, the limits and the coverage floor, held
    against commit `base` (goals/p1-the-gates-hold.yaml). Exits 1 on any loosening."""
    from engine.checks import ratchet as rules

    found = rules.against(base)
    for p in found:
        _say(f"  FAIL  {p}", err=True)
    _say(f"  {len(found)} baseline(s) loosened" if found else "  every baseline held or tightened")
    if found:
        raise typer.Exit(1)


def promises() -> None:
    """No promise without a command: every goal line is a command or one of Nimish's sentences with
    the test that proves it; every decision record from ADR 0032 names its goal. Exits 1 on any gap."""
    from engine.checks import promises as rules

    found = rules.problems()
    for p in found:
        _say(f"  FAIL  {p}", err=True)
    _say(f"  {len(found)} broken promise(s)" if found else "  every promise has its command")
    if found:
        raise typer.Exit(1)


def slices(ref: str = typer.Option("HEAD", help="The history whose × ÷ slices are scored")) -> None:
    """The files each multiplication and division slice changed, per part of the map (BUILD-ORDER, M5e)."""
    from engine.checks import slices as score

    rows = score.of(ref)
    parts = [p for p in score.PARTS if any(p in r["parts"] for r in rows)]
    _say("  " + f"{'slice':<8}{'files':>6}" + "".join(f"{p:>9}" for p in parts))
    for r in rows:
        _say("  " + f"{r['slice']:<8}{r['files']:>6}" + "".join(f"{r['parts'].get(p, ''):>9}" for p in parts))
