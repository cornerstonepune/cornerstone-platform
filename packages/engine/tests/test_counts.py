"""CP-54: `engine curriculum counts` says what is live, from the database, and writes nothing."""

import os

import pytest

from engine.core import db
from engine.w1_bank import cli_counts

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs the local copy (bin/testdb)")


@pytest.fixture
def conn():
    with db.connect() as c:
        yield c
        c.rollback()


def test_counts_give_objectives_and_activities_by_grade_in_scope_and_read_nothing_else(conn):
    t = conn.execute("select id from tenant order by created_at limit 1").fetchone()["id"]
    conn.execute(
        "insert into learning_objective (tenant_id, code, band, subject, unit, title, signal, source, retired, source_text)"
        " values (%s, 'LO-G1-N9001', 'G1', 'Maths', 'u', 'The child counts to ten.', '', 'machine', false, 'Counting')",
        (t,),
    )
    conn.execute(
        "insert into activity (tenant_id, code, band, strand, name, objective) values (%s, 'T-CNT-1', 'G1', 's', 'a', 'o')",
        (t,),
    )
    got = cli_counts.gather(conn, t)
    g1 = next(r for r in got["objectives"] if r["band"] == "G1")
    assert g1["new"] >= 1 and g1["reworded"] >= 1
    assert all(r["band"] in ("K2", "G1", "G2", "G3", "G4") for r in got["objectives"] + got["activities"])
    act = next(r for r in got["activities"] if r["band"] == "G1")
    assert act["needs_link"] >= 1, "an activity with no objective is what needs_link counts"
    assert set(got) == {"objectives", "activities", "capability_links", "apply_seed_runs", "spend"}
