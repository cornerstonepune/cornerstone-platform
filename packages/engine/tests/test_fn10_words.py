"""ADR 0111: the F.N 10 rubric words Nimish signed off reach the database the way a release puts them there: the
migration fills the 15 matched rows' words (only where empty) and shares two K2 rows with K1, and the seed file adds
the six new K1 activities. A fresh database runs migrations before `engine load`, so the test runs the migration over
the loaded test database itself, from the live state (rows there, words empty). Rolls back."""

import os
import re
from pathlib import Path

import pytest

from engine.core import db
from engine.w1_bank import apply_seed
from tests.rows import tenant

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")
ROOT = Path(__file__).resolve().parents[3]
MIGRATION = ROOT / "supabase" / "migrations" / "20270217090000_fn10_rubric_words.sql"
DRAFT = ROOT / "docs" / "loop" / "notes" / "fn10-rubric-draft.md"
NEW = [f"ACT-K1-F00{i}" for i in range(1, 7)]
SHARED = ("ACT-K2-M0018", "ACT-K2-0449")


def drafted() -> dict[str, list[str]]:
    """Each matched activity's four words, as the signed-off draft writes them (`### ACT-… — name`, then L0..L3)."""
    words: dict[str, list[str]] = {}
    for block in re.split(r"^### ", DRAFT.read_text(), flags=re.M)[1:]:
        code = block.split(" ", 1)[0]
        words[code] = [re.search(rf"^\| L{i} \| (.+?) \|$", block, re.M).group(1) for i in range(4)]
    return words


@pytest.fixture
def conn():
    with db.connect() as c:
        yield c
        c.rollback()


def test_fn10_words_and_new_k1_activities_land_as_signed_off(conn):
    t, words = tenant(conn), drafted()
    assert len(words) == 15
    # live's state before release: ACT-K2-M0018 came from the K2 upload, so a test database may not hold it
    conn.execute(
        "insert into activity (tenant_id, code, band, strand, name) values (%s, 'ACT-K2-M0018', 'K2', 'Clay',"
        " 'Making clay carrot, chillies, apple') on conflict do nothing",
        (t,),
    )
    conn.execute(
        "update activity set level_0 = '', level_1 = '', level_2 = '', level_3 = '' where tenant_id = %s and code = any(%s)",
        (t, list(words)),
    )
    conn.execute(MIGRATION.read_text())
    apply_seed.apply(conn, t, True, part="activities")

    got = {
        r["code"]: r
        for r in conn.execute(
            "select code, band, also_bands, level_0, level_1, level_2, level_3 from activity"
            " where tenant_id = %s and code = any(%s)",
            (t, [*words, *NEW, *SHARED]),
        ).fetchall()
    }
    for code, four in words.items():
        assert [got[code][f"level_{i}"] for i in range(4)] == four, code
    for code in SHARED:
        assert "K1" in got[code]["also_bands"], code
    for code in NEW:
        assert got[code]["band"] == "K1", code
        assert all(got[code][f"level_{i}"] for i in range(4)), code
