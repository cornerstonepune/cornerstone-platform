"""W2's timetable commands — `engine timetable load …`: the school's tabs (as CSV) into the six timetable tables, or into
one SQL file for a person to run where this machine cannot reach; `generate`: a draft by FET (CP-11); `go-live`: a
placed draft becomes the fortnight's timetable (CP-22). `engine/cli.py` only mounts this."""

import hashlib
import json
import uuid
from collections import Counter
from contextlib import ExitStack
from datetime import date
from pathlib import Path

import psycopg
import typer

from engine.core import db, settings
from engine.w2_print import fortnight_cycle as fc
from engine.w2_print import k2_timetable as tt
from engine.w2_print import k2_timetable_load as ld
from engine.w2_print import k2_timetable_sql as sq
from engine.w2_print import tt_generate as gen
from engine.w2_print import tt_live as live
from engine.w2_print import tt_need

timetable_app = typer.Typer(help="W2 — the K2 timetable from the school's tabs", no_args_is_help=True)
VOCABULARY = "timetable.vocabulary"


def _held(items: list[str]) -> dict[date, str]:
    out: dict[date, str] = {}
    for item in items:
        day, _, why = item.partition("=")
        if not why.strip():
            raise typer.BadParameter(f"--undecided wants DATE=REASON, got {item!r}")
        out[date.fromisoformat(day.strip())] = why.strip()
    return out


def _vocabulary(conn: db.Conn | None) -> tt.Vocabulary:
    """The words the sheets are read with: the database's row, or the seed file's when there is no database, which is
    the same row (`engine load` puts the seed there)."""
    found = settings.config(conn, VOCABULARY) if conn else None
    try:
        return tt.Vocabulary.from_config(
            found
            or next(c["value"] for c in settings.seed("config.json", "config") if c["key"] == VOCABULARY)
        )
    except KeyError as missing:
        raise typer.BadParameter(
            f"this database's {VOCABULARY} row is older than the code (no {missing}): run `engine load`"
        ) from missing


def _connect(stack: ExitStack) -> db.Conn | None:
    try:
        return stack.enter_context(db.connect())
    except (RuntimeError, psycopg.OperationalError):
        return None


@timetable_app.command("load")
def load(
    frame: Path = typer.Option(..., help="the Time table tab as CSV"),
    planner: Path = typer.Option(..., help="the Monthly Planner tab as CSV"),
    calendar: Path = typer.Option(..., help="the Pre-Primary calendar tab as CSV"),
    section: str = typer.Option(..., help="the section of the class on this database"),
    grade: str = typer.Option(..., help="the grade code of the class, as in the grade table"),
    first: int = typer.Option(10, "--from", help="first fortnight"),
    last: int = typer.Option(17, "--to", help="last fortnight"),
    year: str = typer.Option("2026-27"),
    undecided: list[str] = typer.Option(
        [], "--undecided", help="DATE=REASON: a day two sources disagree about"
    ),
    spans: Path | None = typer.Option(
        None, "--spans", help="frame_spans.json: activities merged over several periods"
    ),
    sql: Path | None = typer.Option(
        None,
        "--sql",
        help="write the rows as one SQL file here, to run elsewhere in one transaction",
    ),
    apply: bool = typer.Option(False, "--apply", help="write to this database (otherwise a dry run)"),
    reason: str | None = typer.Option(
        None, "--reason", help="why, when rows reach a fortnight that is frozen (without it they are refused)"
    ),
) -> None:
    """Dry run unless --apply: prints counts, never the school's text. Safe to run twice."""
    with ExitStack() as stack:
        conn = _connect(stack)
        if apply and conn is None:
            typer.echo(
                "There is no database to write to here: nothing was applied. Use --sql for a file to run elsewhere."
            )
            raise typer.Exit(1)
        files = {"frame": frame, "planner": planner, "calendar": calendar}
        texts = {k: p.read_text() for k, p in files.items()}
        digests = {
            p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in files.values()
        }  # the committed bytes
        vocab = _vocabulary(conn)
        held = _held(undecided)
        frame_in = ld.read_frame_csv(texts["frame"], vocab, json.loads(spans.read_text()) if spans else None)
        cal_in = ld.read_calendar_csv(texts["calendar"], vocab)
        plan_in = ld.read_planner_csv(texts["planner"], vocab)
        plan = ld.build(frame_in, plan_in, cal_in, vocab, first, last, held)
        source = f"{planner.name} sha256:{digests[planner.name][:12]}"
        target = ld.Target(grade, section, year, db.tenant_slug() if conn else "", source)
        counted, linked = _run(conn, plan, target, apply, reason) if conn else (None, None)
    _report(plan, counted, linked, apply, f"fortnights {first} to {last}, {grade} {section} {year}")
    if sql:
        sql.write_text(sq.sql_file(plan, target, digests))
        typer.echo(
            f"  wrote {sql} ({len(plan.sessions)} sessions); run it in one transaction, it prints counts before and after"
        )


@timetable_app.command("generate")
def generate(
    grade: str = typer.Option(..., help="the grade code of the class, as in the grade table"),
    section: str = typer.Option(..., help="the section of the class on this database"),
    year: str = typer.Option("2026-27"),
    fortnight: int = typer.Option(..., help="the fortnight's number in that year"),
    dry: bool = typer.Option(
        False, "--dry", help="do everything in a read-only transaction and keep nothing"
    ),
) -> None:
    """A draft timetable for one class and one fortnight, made by FET from the school's rules and kept with FET's input
    and output. Never writes to the timetable, the sessions or the plan lines; --dry keeps nothing at all."""
    with db.connect() as conn:
        if dry:
            conn.execute("set transaction read only")
        try:
            run = gen.generate(conn, grade, section, year, fortnight)
        except (tt_need.NoSuchFortnight, gen.MissingSetting) as no:
            typer.echo(str(no))
            raise typer.Exit(1) from no
        if dry:
            conn.rollback()
        else:
            gen.keep(conn, run)
            conn.commit()
    for line in gen.lines(run):
        typer.echo(line)
    if run.outcome != "placed":
        raise typer.Exit(1)


@timetable_app.command("go-live")
def go_live(
    grade: str = typer.Option(..., help="the grade code of the class, as in the grade table"),
    section: str = typer.Option(..., help="the section of the class on this database"),
    year: str = typer.Option("2026-27"),
    fortnight: int = typer.Option(..., help="the fortnight's number in that year"),
    run: str = typer.Option(
        ..., "--run", help="the id of the placed draft (`engine timetable generate` kept it)"
    ),
    by: str = typer.Option(..., "--by", help="the email of the person putting it live"),
    reason: str | None = typer.Option(None, "--reason", help="why, when the fortnight is frozen (CP-6)"),
    discard: bool = typer.Option(
        False, "--discard-changes", help="overwrite changes made by hand since the fortnight last went live"
    ),
    dry: bool = typer.Option(
        False, "--dry", help="a trial run: show what would change, date by date; write nothing"
    ),
) -> None:
    """Put a placed draft live for one class and one fortnight: the educator's day shows the draft on every date; planned
    lessons keep their plan line and materials; who, when and which draft are kept. A refusal writes nothing."""
    try:
        run_id = str(uuid.UUID(run))
    except ValueError as bad:
        raise typer.BadParameter("--run wants the draft's id") from bad
    with db.connect() as conn:
        if dry:  # looking the person up logs itself; a trial run rolls that back with everything else
            conn.execute("set transaction read write")
        who = _staff_of(conn, by)
        if dry:
            conn.execute("set transaction read only")
        try:
            report = live.go_live(
                conn,
                grade,
                section,
                year,
                fortnight,
                run_id=run_id,
                who=who,
                reason=reason,
                discard=discard,
                dry=dry,
            )
        except (live.Refused, tt_need.NoSuchFortnight, fc.CycleError) as no:
            conn.rollback()
            typer.echo(f"{no}\nNothing was written.")
            raise typer.Exit(1) from no
        if dry:
            conn.rollback()
        else:
            conn.commit()
    for line in report.lines():
        typer.echo(line)


def _staff_of(conn: db.Conn, by: str) -> db.Id:
    """The member of staff an email names, by id (the lookup is logged by `staff_of_email`); refused when no one, or
    more than one, has it."""
    row = conn.execute("select public.staff_of_email(%s) as id", (by,)).fetchone()
    if not row or row["id"] is None:
        raise typer.BadParameter("no one member of staff has the email given to --by")
    return row["id"]


def _run(
    conn: db.Conn, plan: ld.Load, target: ld.Target, apply: bool, reason: str | None = None
) -> tuple[tuple[dict[str, int], dict[str, int]] | None, int | None]:
    """What the load added and what the class holds after it (so before = after - added), and how many lines linked."""
    try:
        added = sq.apply(conn, plan, target, reason=reason)
        counted: tuple[dict[str, int], dict[str, int]] | None = (added, sq.counts(conn))
        linked: int | None = sq.linked(conn)
    except sq.NoSuchClass as no:
        typer.echo(f"  no such class on this database: {no}; nothing was written")
        counted, linked = None, None
    except fc.CycleError as no:
        typer.echo(f"  {no} Nothing was written.")
        conn.rollback()
        raise typer.Exit(1) from no
    except sq.LiveFortnight as no:
        typer.echo(
            f"  fortnight {no} is live from a generated draft: the sheet is not loaded over it. Nothing was written."
        )
        conn.rollback()
        raise typer.Exit(1) from no
    if apply and counted is not None:
        conn.commit()
    else:
        conn.rollback()
    return counted, linked


def _report(
    plan: ld.Load,
    counted: tuple[dict[str, int], dict[str, int]] | None,
    linked: int | None,
    apply: bool,
    heading: str,
) -> None:
    typer.echo(heading)
    typer.echo(
        f"  {'table':<15}{'planned':>8}" + (f"{'added':>8}{'before':>8}{'after':>8}" if counted else "")
    )
    for name, n in ld.summary(plan).items():
        row = f"  {name:<15}{n:>8}"
        if counted:
            added, after = counted
            row += f"{added[name]:>8}{after[name] - added[name]:>8}{after[name]:>8}"
        typer.echo(row)
    if counted and not apply:
        typer.echo("  dry run: nothing was written; 'after' is what the class would hold")
    typer.echo(
        f"  planner lines linked to exactly one activity: {'unknown without a database' if linked is None else linked}"
    )
    typer.echo(
        f"  planner lines with no period, by heading: {dict(Counter(k for _, k, _ in plan.no_slot)) or 'none'}"
    )
    for label, items in (
        ("rows by week", plan.split),
        ("undecided day", plan.undecided),
        ("fortnight with no planner row", plan.missing_plan),
        ("conflict", plan.conflicts),
    ):
        for what, why in items:
            typer.echo(f"  {label}: {what} — {why}")
