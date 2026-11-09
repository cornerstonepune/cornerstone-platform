"""W2's timetable-by-hand commands (CP-12): `engine timetable move | accept | clashes`. The rules are `tt_move` and
`tt_clash`; these commands only name the person (`--by EMAIL`, found as the one member of staff with that email, as every
command's --by is), call and print. `cli_timetable` mounts them. A line printed names a fortnight, a kind, a date and a
period, never a person."""

from datetime import date

import psycopg
import typer

from engine.core import db
from engine.w1_bank.cli_map import staff_of
from engine.w2_print import educator_gate as gate
from engine.w2_print import fortnight_cycle as fc
from engine.w2_print import tt_clash, tt_move

YEAR = typer.Option("2026-27", help="the school year, as the academic_year label")


def _refused(conn: db.Conn, no: Exception) -> None:
    conn.rollback()
    why = no.diag.message_primary if isinstance(no, psycopg.Error) else str(no)
    typer.echo(f"{why}\nNothing was written.")
    raise typer.Exit(1) from no


def mount(app: typer.Typer) -> None:
    @app.command("move")
    def move(
        grade: str = typer.Option(..., help="the grade code of the class, as in the grade table"),
        section: str = typer.Option(..., help="the section of the class on this database"),
        year: str = YEAR,
        frm: str = typer.Option(..., "--from", help="the lesson's day, YYYY-MM-DD"),
        from_period: int = typer.Option(..., "--from-period", help="its period's number in the grade's day"),
        to: str = typer.Option(..., "--to", help="the day it moves to, in the same fortnight"),
        to_period: int = typer.Option(..., "--to-period", help="the period's number it moves to"),
        by: str = typer.Option(..., "--by", help="the email of the person moving it"),
        reason: str | None = typer.Option(
            None, "--reason", help="why (needed once the fortnight is frozen, CP-6)"
        ),
    ) -> None:
        """Move one lesson to another day or period of its fortnight; a lesson already there swaps places with it.
        Kept with who, when, from, to and why. A refusal says why and writes nothing."""
        try:
            days = (date.fromisoformat(frm), date.fromisoformat(to))
        except ValueError as bad:
            raise typer.BadParameter("--from and --to want a day as YYYY-MM-DD") from bad
        with db.connect() as conn:
            who = staff_of(conn, by)
            try:
                done = tt_move.move(
                    conn,
                    grade,
                    section,
                    year,
                    days[0],
                    from_period,
                    days[1],
                    to_period,
                    who=who,
                    reason=reason,
                )
            except (tt_move.Refused, fc.CycleError, psycopg.Error) as no:
                _refused(conn, no)
            conn.commit()
        swapped = f", swapped with {done['swapped_with']}" if done["swapped_with"] else ""
        typer.echo(
            f"fortnight {done['fortnight']}: {done['moved']} moved from {done['from']} to {done['to']}{swapped}"
        )

    @app.command("accept")
    def accept(
        key: str = typer.Option(
            ..., "--key", help="the clash's key, as `engine timetable clashes` prints it"
        ),
        by: str = typer.Option(..., "--by", help="the email of the person accepting it"),
        reason: str = typer.Option(..., "--reason", help="why the clash is acceptable"),
    ) -> None:
        """Accept one clash with a reason; kept with who and when. Only the school's accepting group may."""
        with db.connect() as conn:
            who = staff_of(conn, by)
            try:
                done = tt_clash.accept(conn, key, who=who, reason=reason, today=gate.school_today(conn))
            except (tt_clash.Refused, psycopg.Error) as no:
                _refused(conn, no)
            conn.commit()
        typer.echo(f"{done['fortnight']}: {done['kind']} accepted ({done['detail']})")

    @app.command("clashes")
    def clashes(
        year: str = YEAR,
        fortnight: int | None = typer.Option(None, "--fortnight", help="one fortnight, by its number"),
    ) -> None:
        """Every clash of the year's fortnights (or one), worked out from the timetable as it stands: one group per
        fortnight, each clash on one line with its kind, week, what it is, whether accepted, and its key."""
        with db.connect() as conn:
            rows = tt_clash.listing(conn, year, fortnight)
        if not rows:
            typer.echo("no clashes")
            return
        head = None
        for r in rows:
            if tt_clash.heading(r) != head:
                head = tt_clash.heading(r)
                typer.echo(head)
            week = f"week {r['week_code']}" if r["week_code"] else "fortnight"
            state = "accepted" if r["accepted"] else "open"
            typer.echo(f"  {r['kind']} {week}: {r['detail']} [{state}] key {r['clash_key']}")
