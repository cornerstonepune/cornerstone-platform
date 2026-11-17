"""CP-71 (specs/CP-71/spec.md S1): for Grades 1 to 4 a lesson's head is the subject table's code, as rows of the settings
`timetable.heads` and `timetable.subject_looks`, never a pairing in code. Reads the seed and the test copy; writes nothing."""

import json
import os
from pathlib import Path

import pytest

from engine.core import db, subject_map
from engine.w2_print import tt_heads

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")
SEED = Path(__file__).resolve().parents[3] / "supabase" / "seed"


def _seeded(key: str):
    rows = json.loads((SEED / "config.json").read_text())
    rows = rows["config"] if isinstance(rows, dict) else rows
    return next(r["value"] for r in rows if r["key"] == key)


def test_every_subject_is_a_head_whose_groups_spell_that_subject_and_wears_a_look():
    subjects = {s["code"] for s in json.loads((SEED / "subjects.json").read_text())["subjects"]}
    heads = {h["code"]: h for h in _seeded("timetable.heads")}
    looks = _seeded("timetable.subject_looks")
    with db.connect() as conn:
        tenant = db.one(conn, "select id from tenant where slug = %s", (db.tenant_slug(),))["id"]
        spelled = subject_map.spellings(conn, tenant)
        listed = tt_heads.heads(conn)
    assert subjects <= set(heads), "every subject of the subject table is a head of Grades 1 to 4"
    for code in subjects:
        assert all(spelled.get(g) == code for g in heads[code]["groups"]), (
            f"{code}: a group that spells another subject"
        )
        assert code in looks, f"{code} wears no look"
        if heads[code]["groups"]:
            assert tt_heads.heads_in(listed, spelled, [code]) >= {code}, f"{code} does not resolve to itself"
    assert "math" in tt_heads.heads_in(listed, spelled, ["NUM"]), "K2's head still reaches its subject"
