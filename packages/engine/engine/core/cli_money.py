"""`engine money import`: the school's expense sheet, as history (CP-81). Run where the live database is, by path; the files never enter the repository."""

from pathlib import Path

import typer

from engine.core import db, money_import, staff_load

money_app = typer.Typer(help="The school's money", no_args_is_help=True)


@money_app.command("import")
def import_(
    expenses: Path = typer.Argument(..., help="The sheet's lines (expense_lines.csv)"),
    bills: Path = typer.Argument(..., help="The check of each line's bill file (bill_match_by_line.csv)"),
    apply_: bool = typer.Option(
        False, "--apply", help="Do it. Without this nothing is written and what would happen is shown"
    ),
) -> None:
    """Fill the expense sheet in as history: one claim per line, marked as an earlier record. Safe to run twice."""
    try:
        paths = [staff_load.outside_repository(p, "the file") for p in (expenses, bills)]
    except ValueError as e:
        raise typer.BadParameter(str(e)) from e
    with db.connect() as conn:
        p = money_import.plan(conn, *paths)
        total = sum(ln.amount for ln in p.lines)
        typer.echo(f"  {len(p.lines)} lines to add, ₹{total:,.2f}; {p.already} already there")
        for ref, why in p.skipped:
            typer.echo(f"  skipped {ref}: {why}")
        for what, n in p.dated.items():
            if n:
                typer.echo(f"  {n} lines dated by their month ({what}), said in each note")
        for spelling, name in sorted(p.same.items()):
            typer.echo(f"  taking '{spelling}' for '{name}'")
        if p.new_people:
            typer.echo(
                f"  {len(p.new_people)} people added as former staff, no sign-in: {', '.join(p.new_people)}"
            )
        if p.new_categories:
            typer.echo(f"  categories added to the settings: {', '.join(p.new_categories)}")
        if not apply_:
            typer.echo("  This was a dry run: nothing changed. Add --apply to do it.")
            return
        done = money_import.apply(conn, p)
        conn.commit()
    typer.echo(f"  done: {', '.join(f'{n} {k}' for k, n in done.items())}")
