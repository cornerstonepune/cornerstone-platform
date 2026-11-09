"""`engine graph --nightly` and `engine graph --hand-check` (CP-9). Its own module so `cli.py` stays one screen."""

import typer

from engine.core import db
from engine.w3_read import nightly as night


def run(nightly: bool, child_id: str, hand_check: tuple[str, str, str, str]) -> None:
    if nightly:
        with db.connect() as conn:
            try:
                got = night.nightly(conn)
            except Exception as e:
                conn.rollback()
                night.failed(conn, e)
                conn.commit()
                raise
            conn.commit()
        typer.echo(
            "  skipped: a run is already going"
            if got["skipped"]
            else f"  {got['skill_states']} + {got['observed_states']} states for {got['children']} children"
        )
        return
    if not (child_id and all(hand_check)):
        raise typer.BadParameter("--hand-check needs --child and SKILL GRADE EXPECTED BY")
    with db.connect() as conn:
        got = night.hand_check(conn, child_id, *hand_check)
        conn.commit()
    typer.echo(f"  system says {got['system_state']}: {'matches' if got['matches'] else 'DOES NOT MATCH'}")
