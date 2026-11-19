"""W2's materials commands (tasks M1-10, M1-16, CP-84): `engine reminders --due`, `engine materials month`, `engine materials cost`,
`engine materials categorise`, `engine materials merge`.
`engine/cli.py` only mounts this."""

import datetime as dt

import typer

from engine.core import catalogue_category, db
from engine.w2_print import (
    materials_cost,
    materials_coverage,
    materials_list,
    materials_merge,
    materials_month,
    materials_remind,
)

materials_app = typer.Typer(help="W2 — the school's materials list", no_args_is_help=True)


def _off(conn: db.Conn) -> bool:
    if materials_list.enabled(conn):
        return False
    typer.echo("educator.timetable_enabled is off: nothing is done")
    return True


@materials_app.command("month")
def month(
    from_: dt.datetime = typer.Option(
        ..., "--from", formats=["%Y-%m-%d"], help="First day of the month, YYYY-MM-DD"
    ),
    to: dt.datetime = typer.Option(
        ..., "--to", formats=["%Y-%m-%d"], help="Last day of the month, YYYY-MM-DD"
    ),
) -> None:
    """Build every class's list for the month, then the school's, and say which classes it is short of."""
    with db.connect() as conn:
        if _off(conn):
            return
        tenant = db.one(conn, "select id from tenant where slug = %s", (db.tenant_slug(),))["id"]
        try:
            got = materials_month.build_month(conn, tenant, from_.date(), to.date())
        except ValueError as no:
            raise typer.BadParameter(str(no)) from no
    typer.echo(f"school list {got['consolidated_id']}: {len(got['built'])} classes built")
    for key, why in materials_coverage.WHY.items():
        for c in got[key]:
            typer.echo(f"  short: {c['class']} ({why})")


@materials_app.command("cost")
def cost() -> None:
    """What reading notes has cost this month against its cap, from the calls recorded. Reads only; calls no model."""
    with db.connect() as conn:
        r = materials_cost.report(conn)
    typer.echo(
        f"this month: {r['calls']} calls ({r['errors']} failed), {r['tokens_in']} tokens in, {r['tokens_out']} out,"
        f" Rs {r['cost_inr']:.2f} (${r['cost_usd']:.3f}), {r['share_of_limit']:.0%} of the cap"
        f" (${r['limit_usd']:.2f} of ${r['cap_usd']})"
    )
    if not r["spend_known"]:
        typer.echo(
            f"  spend unknown: {r['running']} calls still running, {r['cost_unknown']} answered with no cost recorded;"
            " the cap's gate stops until a person has looked"
        )
    if r["avg_tokens_in"] is not None:
        typer.echo(f"  per call: {r['avg_tokens_in']} tokens in, {r['avg_tokens_out']} out on average")


_MOST_LEFT = 40


@materials_app.command("categorise")
def categorise(
    dry_run: bool = typer.Option(False, "--dry-run", help="Say what would be done and change nothing"),
) -> None:
    """Give every catalogue item with no category the one its last word names (the setting `materials.category_words`; a plural reads as its
    singular). An item that has a category, above all one a person set, is never changed; an item the words do not name reads "needs a
    category" for a person to choose."""
    with db.connect() as conn:
        tenant = db.one(conn, "select id from tenant where slug = %s", (db.tenant_slug(),))["id"]
        plan = catalogue_category.categorise(conn, tenant, dry_run)
    verb = "would give" if dry_run else "gave"
    typer.echo(
        f"{verb} {len(plan['set'])} items a category{' (a dry run: nothing is changed)' if dry_run else ''}"
    )
    for item in plan["set"]:
        typer.echo(f"  {item['name']}: {item['category']}")
    left = plan["left"]
    typer.echo(
        f'{len(left)} items still read "{catalogue_category.NEEDS}"; {plan["kept"]} already had one and are left as they are'
    )
    for item in left[:_MOST_LEFT]:
        typer.echo(f"  {item['name']}")
    if len(left) > _MOST_LEFT:
        typer.echo(f"  and {len(left) - _MOST_LEFT} more")
    if plan["not_on_list"]:
        typer.echo(
            f"  the words name categories the school's list lacks, so they name nothing: {', '.join(plan['not_on_list'])}"
        )


@materials_app.command("merge")
def merge(
    dry_run: bool = typer.Option(False, "--dry-run", help="Say what would be done and change nothing"),
) -> None:
    """Make one item of every group of items that are one thing written twice ("flash card" and "flashcard"): the item the most activities use is
    kept, the rest are pointed at it (its rows, its name as an approved word) and removed. An item with stock recorded is left, and said so, for a
    person. Safe to run again: a second run finds nothing."""
    with db.connect() as conn:
        tenant = db.one(conn, "select id from tenant where slug = %s", (db.tenant_slug(),))["id"]
        plan = materials_merge.merge(conn, tenant, dry_run)
    for line in materials_merge.lines(plan):
        typer.echo(line)


def register_materials(app: typer.Typer) -> None:
    app.add_typer(materials_app, name="materials")

    @app.command("reminders")
    def reminders(
        due: bool = typer.Option(False, "--due", help="Count the materials reminders that have come due"),
    ) -> None:
        """Count the materials-list reminders due today. It sends nothing and changes nothing: the educator sees them
        in her inbox, and the box's timer runs this so the count is in its log."""
        if not due:
            raise typer.BadParameter("say what to do: --due")
        with db.connect() as conn:
            if not materials_list.enabled(conn):
                typer.echo("educator.timetable_enabled is off: nothing is due")
                return
            tenant = db.one(conn, "select id from tenant where slug = %s", (db.tenant_slug(),))["id"]
            n = materials_remind.due_counts(conn, materials_remind.school_today(conn), tenant)
        typer.echo(
            f"due: {n['reminders']} reminders for {n['lists']} lists (educator {n['educator']}, team {n['team']})"
        )
