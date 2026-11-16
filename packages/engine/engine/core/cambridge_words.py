"""Puts Cambridge's words into the private database (CP-54 B1, Nimish 16 Nov: the licence is coming, approved).

The public repository keeps, for each Cambridge statement, its place and the sha256 of its words (research/
crosswalk_build.py `public`); framework_statement holds text NULL and that fingerprint. This reads each framework's PDF
(url and sha256 in framework.documents, the structure to read it by in docs/crosswalk/sources.json) with the one reader
(core/cambridge.py), and fills a statement's words only where the fingerprint of what was read equals the stored one.
A statement that does not match is listed by code, never filled and never shown. The words are written to the database
and nowhere else: not to git, not to a log, not to the screen.
"""

import json
from dataclasses import dataclass, field
from pathlib import Path

from engine.core import cambridge, db

SOURCES = db.REPO_ROOT / "docs" / "crosswalk" / "sources.json"
COPIES = db.REPO_ROOT / "data" / "crosswalk_sources"  # the PDFs, on the server's own disk (never in git)
KINDS = ("learning_objective", "characteristic", "note")


@dataclass
class Result:
    framework: str
    held: int = 0  # of the statements that have a fingerprint
    filled: int = 0  # words put in by this run
    already: int = 0  # words that were there and are the fingerprint's
    # codes whose reading is not the fingerprint's: left empty
    mismatched: list[str] = field(default_factory=lambda: [])


def _sources() -> list[cambridge.Row]:
    return [s for s in json.loads(SOURCES.read_text()) if s.get("reader") == "cambridge_primary"]


def _readings(source: cambridge.Row, folder: Path) -> dict[str, cambridge.Row]:
    """code -> the row as read: objectives and characteristics by code, a note as note.<stage>.<n> (as the import names it)."""
    rows, notes, _, _ = cambridge.read(source, cambridge.fetch(source, folder))
    out = {r["code"]: r for r in rows}
    for i, n in enumerate(notes, 1):
        out[f"note.{n['stage']}.{i}"] = n
    return out


def fill(conn: db.Conn, t: db.Id, apply: bool, folder: Path = COPIES) -> list[Result]:
    """Fill every Cambridge statement whose words are not yet in; `apply` False reads and compares and writes nothing."""
    results: list[Result] = []
    for source in _sources():
        code = source["framework"]
        doc = conn.execute(
            "select documents from framework where tenant_id = %s and code = %s", (t, code)
        ).fetchone()
        if doc is None or source["sha256"] not in {d.get("sha256") for d in doc["documents"]}:
            raise SystemExit(
                f"{code}: the framework row does not name the copy sources.json reads: run `engine load` first"
            )
        read = _readings(source, folder)
        res = Result(code)
        for row in conn.execute(
            "select code, text, text_sha256 from framework_statement where tenant_id = %s and framework_code = %s"
            " and text_sha256 is not null and kind = any(%s) order by code",
            (t, code, list(KINDS)),
        ).fetchall():
            res.held += 1
            got = read.get(row["code"])
            if got is None or cambridge.fingerprint(got) != row["text_sha256"]:
                res.mismatched.append(row["code"])
            elif row["text"] is not None:
                res.already += 1
            else:
                res.filled += 1
                if apply:
                    conn.execute(
                        "update framework_statement set text = %s, items = %s where tenant_id = %s"
                        " and framework_code = %s and code = %s",
                        (got["text"], json.dumps(got.get("items", [])), t, code, row["code"]),
                    )
        results.append(res)
    return results
