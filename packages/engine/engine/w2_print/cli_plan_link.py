"""W2's plan-line linking commands — `engine timetable link | link-undo | unmatched` (CP-8). A plan line is one line of a
class's fortnight plan; linking gives it the activity it names. The rules live in the database (`plan_line_candidate`,
`plan_link_apply`, `plan_link_undo`); these commands only count, call and print, fortnight by fortnight. `cli_timetable`
mounts them. Plan-line text is the school's curriculum text; no person's name is read or printed."""

from collections import Counter
from uuid import UUID

import typer

from engine.core import db, settings

BY = "engine timetable link"
REASONS = ("no_match", "several_matches", "ready_to_link")
FORTNIGHT = typer.Option(None, "--fortnight", help="only this fortnight, by its number")
BAND = typer.Option(
    None, "--band", help="the grade whose classes are linked (default: the timetable.link_band row)"
)


def _band(conn: db.Conn, given: str | None) -> str:
    band = given or settings.config(conn, "timetable.link_band")
    if not band:
        raise typer.BadParameter("no --band given and no timetable.link_band config row: run `engine load`")
    return band


def _lines(conn: db.Conn, tenant: str, band: str, fortnight: int | None) -> list[dict]:
    """Every plan line of the band's classes with its fortnight, week, class, whether linked and, if not, why."""
    return conn.execute(
        "select f.number as fortnight, pe.week_code as week, pe.plan_key, pe.text, sc.section,"
        " pe.activity_id is not null as linked, u.reason"
        " from plan_entry pe join tenant t on t.id = pe.tenant_id and t.slug = %s"
        " join school_class sc on sc.id = pe.school_class_id and sc.grade_code = %s"
        " join fortnight f on f.id = pe.fortnight_id"
        " left join plan_unmatched u on u.plan_entry_id = pe.id"
        " where %s::int is null or f.number = %s::int"
        " order by f.number, sc.section, pe.plan_key, pe.ord",
        (tenant, band, fortnight, fortnight),
    ).fetchall()


def _count_line(rows: list[dict]) -> str:
    by = Counter(r["reason"] for r in rows if not r["linked"])
    linked = sum(r["linked"] for r in rows)
    share = f"{100 * linked / len(rows):.0f}%" if rows else "-"
    return (
        f"{len(rows)} lines, {linked} linked ({share}), "
        + ", ".join(f"{k} {by[k]}" for k in REASONS)
        + f"; a run would link {by['ready_to_link']}"
    )


def _counts(rows: list[dict]) -> None:
    for n in sorted({r["fortnight"] for r in rows}):
        typer.echo(f"FN{n}: {_count_line([r for r in rows if r['fortnight'] == n])}")


def link(
    apply: bool = typer.Option(False, "--apply", help="write a run (otherwise a dry run: counts only)"),
    fortnight: int | None = FORTNIGHT,
    band: str | None = BAND,
) -> None:
    """Link every plan line that names exactly one activity. Counts per fortnight; a tie is never broken."""
    with db.connect() as conn:
        tenant, band = db.tenant_slug(), _band(conn, band)
        if apply:
            run = db.one(
                conn,
                "select plan_link_apply(t.id, %s, %s, %s) as run from tenant t where t.slug = %s",
                (band, BY, fortnight, tenant),
            )["run"]
            n = db.one(conn, "select count(*) as n from plan_entry where link_run = %s", (run,))["n"]
            conn.commit()
            typer.echo(f"run {run}: linked {n} lines")
        rows = _lines(conn, tenant, band, fortnight)
        typer.echo(f"{band} {'after the run' if apply else 'dry run, nothing written'}: {_count_line(rows)}")
        _counts(rows)


def link_undo(run: UUID = typer.Argument(..., help="the run id `link --apply` printed")) -> None:
    """Undo a run as a whole: the lines it linked are unlinked again; a line a person changed since is left."""
    with db.connect() as conn:
        n = db.one(conn, "select plan_link_undo(%s, %s) as n", (run, BY))["n"]
        conn.commit()
    typer.echo(f"undid run {run}: {n} lines unlinked")


def unmatched(fortnight: int | None = FORTNIGHT, band: str | None = BAND) -> None:
    """The lines with no activity, by fortnight, each with its reason (and week A or B when the fortnight has two)."""
    with db.connect() as conn:
        band = _band(conn, band)
        rows = [r for r in _lines(conn, db.tenant_slug(), band, fortnight) if not r["linked"]]
    for n in sorted({r["fortnight"] for r in rows}):
        part = [r for r in rows if r["fortnight"] == n]
        typer.echo(f"Fortnight {n}: {len(part)} lines with no activity")
        for r in part:
            week = f" week {r['week']}" if r["week"] else ""
            typer.echo(f"  {r['reason']}{week}  {band} {r['section']} {r['plan_key']}: {r['text']}")
    if not rows:
        typer.echo("every plan line has an activity")


def mount(app: typer.Typer) -> None:
    app.command("link")(link)
    app.command("link-undo")(link_undo)
    app.command("unmatched")(unmatched)
