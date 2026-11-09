"""`engine fortnight approve` (CP-12, design decision 6): the step of a teaching fortnight into `approved` (CP-6's cycle,
`fortnight_cycle.move`), refused while the fortnight has a timetable clash nobody accepted when the school's
`timetable.open_clash_blocks_approval` setting is on. The check sits here, in the command, not in a database trigger
(lean, Nimish 9 Nov): any later screen goes through this command. `engine/cli.py` only mounts this."""

import psycopg
import typer

from engine.core import db
from engine.w1_bank.cli_map import staff_of
from engine.w2_print import fortnight_cycle as fc
from engine.w2_print import tt_clash

fortnight_app = typer.Typer(help="W2 — the fortnight cycle's steps", no_args_is_help=True)


def _fortnight(conn: db.Conn, year: str, number: int) -> dict:
    f = conn.execute(
        "select f.id, f.tenant_id, f.number from fortnight f join academic_year y on y.id = f.academic_year_id"
        " join tenant t on t.id = f.tenant_id where t.slug = %s and y.label = %s and f.number = %s"
        " and f.kind = 'teaching'",
        (db.tenant_slug(), year, number),
    ).fetchone()
    if f is None:
        raise fc.CycleError(f"There is no teaching fortnight {number} in {year}.")
    return f


@fortnight_app.command("approve")
def approve(
    year: str = typer.Option("2026-27", help="the school year, as the academic_year label"),
    fortnight: int = typer.Option(..., "--fortnight", help="the fortnight's number in that year"),
    by: str = typer.Option(..., "--by", help="the email of the person approving"),
) -> None:
    """Approve a fortnight (its cycle step from aligned to approved). Refused, writing nothing, while a clash in it is
    not accepted (unless the school has switched that setting off), or when CP-6's order or CP-7's gate refuses."""
    with db.connect() as conn:
        who = staff_of(conn, by)
        try:
            f = _fortnight(conn, year, fortnight)
            if tt_clash.blocks_approval(conn, f["tenant_id"]):
                open_ = tt_clash.open_by_kind(conn, f["id"])
                if open_:
                    raise fc.CycleError(
                        f"Fortnight {fortnight} has {tt_clash.words(open_)}: accept each, or move the lesson."
                    )
            fc.move(conn, f["id"], "approved", str(who))
        except (fc.CycleError, psycopg.Error) as no:
            conn.rollback()
            why = no.diag.message_primary if isinstance(no, psycopg.Error) else str(no)
            typer.echo(f"{why}\nNothing was written.")
            raise typer.Exit(1) from no
        conn.commit()
    typer.echo(f"fortnight {fortnight} of {year}: approved")
