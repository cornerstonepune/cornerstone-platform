"""`engine frameworks cambridge-words` (CP-54 B1): Cambridge's words into the private database. A dry run unless `--apply`."""

import typer

from engine.core import cambridge_words, db, frameworks

frameworks_app = typer.Typer(help="The frameworks an objective is held against", no_args_is_help=True)


def _tenant(conn: db.Conn) -> db.Id:
    return db.one(conn, "select id from tenant where slug = %s", (db.tenant_slug(),))["id"]


@frameworks_app.command("load")
def load_() -> None:
    """Put the frameworks, their statements and the objectives' links in from docs/crosswalk and the spine (a second run changes nothing)."""
    with db.connect() as conn:
        counts = frameworks.load(conn, _tenant(conn))
        conn.commit()
    typer.echo("  " + ", ".join(f"{k}: {v}" for k, v in counts.items()))


@frameworks_app.command("cambridge-words")
def cambridge_words_(
    apply: bool = typer.Option(False, "--apply", help="Write the words; without it, read and compare only"),
) -> None:
    """Fill each Cambridge statement's words from its recorded PDF, only where they are the stored fingerprint's.

    Prints counts and the codes that do not match; never a word.
    """
    with db.connect() as conn:
        t = _tenant(conn)
        results = cambridge_words.fill(conn, t, apply)
        if apply:
            conn.commit()
    bad = 0
    for r in results:
        typer.echo(
            f"  {r.framework}: {r.held} held, {r.already} already in, {r.filled} {'filled' if apply else 'would fill'}"
        )
        if r.mismatched:
            bad += len(r.mismatched)
            typer.echo(f"    does not match its fingerprint, left empty: {', '.join(r.mismatched)}")
    typer.echo(f"  {sum(r.held for r in results)} Cambridge statements, {bad} not matching")
    if not apply:
        typer.echo("  dry run — nothing written. Add --apply to write it.")
    raise typer.Exit(1 if bad else 0)
