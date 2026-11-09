"""CP-14 item 7 (LIVE, on the box): the K2 educator's list is loaded; the number of links between K2 activity skills is
above zero and none is left undecided.

Read through the one reader allowed to see every link whatever its status: `engine links check --k2`
(`engine/checks/links.py`, through `skill_link_audit`; design §4), run in-process with its connection made read-only
before it asks anything. The command prints, for the links whose two ends are both skills of K2 activities, one count
per link status as `<count> <status>` (or `<status>: <count>`). This proof prints those counts only: no skill code, no
name, no row. It never writes.
Run on the box: packages/engine/.venv/bin/python specs/CP-14/proofs/live_k2_links.py
"""

import contextlib
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "packages" / "engine"))

from typer.testing import CliRunner  # noqa: E402

from engine.core import db  # noqa: E402

STATUSES = ("proposed", "confirmed", "withdrawn")
_connect = db.connect


@contextlib.contextmanager
def read_only(url=None):
    with _connect(url) as conn:
        conn.execute("set transaction read only")
        yield conn
        conn.rollback()


def counts(text: str) -> dict[str, int]:
    words = "|".join(STATUSES)
    found = {s: int(n) for s, n in re.findall(r"\b(%s)[ \t]*[:=][ \t]*(\d+)" % words, text)}
    return found or {s: int(n) for n, s in re.findall(r"(\d+)[ \t]+(%s)\b" % words, text)}


def main() -> int:
    from engine.cli import app

    db.connect = read_only  # the command's own connection, read-only before its first question
    out = CliRunner().invoke(app, ["links", "check", "--k2"])
    if out.exception and not isinstance(out.exception, SystemExit):
        print(f"engine links check --k2 failed: {type(out.exception).__name__}")
        return 1
    got = counts(out.stdout)
    if "proposed" not in got:
        print(f"engine links check --k2 printed no K2 count by status (exit {out.exit_code})")
        return 1
    total = sum(got.values())
    print(f"K2 activity-skill links: {total} in all; " + ", ".join(f"{got.get(s, 0)} {s}" for s in STATUSES))
    if total <= 0:
        print("no link between K2 activity skills is loaded")
        return 1
    if got["proposed"]:
        print(f"{got['proposed']} link(s) still undecided")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
