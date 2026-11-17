"""The ledger of machine-made objective codes: one fact, one place.

A new objective is named in the seed files by its `ref`; its code (`LO-<band>-N###`) comes from
`supabase/seed/curriculum/new_lo_codes.json`, never from where the ref sits in a file, so reordering or removing entries
in a file can never move a code onto another objective. `highest` is the highest number ever used in a band (orphans
included), so a number is never reused."""

import json
import re
from pathlib import Path
from typing import Any

from engine.core import db

NAME = "new_lo_codes.json"
Row = dict[str, Any]


def load(root: Path) -> dict[str, Any]:
    """The ledger in the seed's curriculum folder (`root`); an empty one when the file is not there."""
    path = root / NAME
    return json.loads(path.read_text()) if path.exists() else {"codes": {}, "highest": {}}


def code_for(ledger: dict[str, Any], grade: str, ref: str) -> str | None:
    return ledger.get("codes", {}).get(grade, {}).get(ref)


def missing_fault(ledger: dict[str, Any], grade: str, file: str) -> str:
    nxt = int(ledger.get("highest", {}).get(grade, 0)) + 1
    return f"rule 0: this ref has no code in new_lo_codes.json: add it under {grade} (next free number is N{nxt:03d}); file {file}"


def orphans(conn: db.Conn, t: db.Id, ledger: dict[str, Any]) -> list[Row]:
    """Machine-made N-rows no ref points at any more, still live and with no activity link."""
    used = {c for g in ledger.get("codes", {}).values() for c in g.values()}
    if not used:
        return []  # no ledger, nothing is known to be an orphan
    rows = conn.execute(
        "select code, band, title, source_text, signal from learning_objective lo where tenant_id = %s and source = 'machine' and not retired"
        " and code ~ '^LO-[A-Z0-9]+-N[0-9]+$' and not exists"
        " (select 1 from activity_objective a where a.tenant_id = lo.tenant_id and a.lo_code = lo.code) order by code",
        (t,),
    ).fetchall()
    return [r for r in rows if r["code"] not in used and re.search(r"-N\d+$", r["code"])]
