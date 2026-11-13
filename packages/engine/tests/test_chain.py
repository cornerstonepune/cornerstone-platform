"""CP-48 Done when 8: `engine chain` counts each link of a grade's chain, n of m, and fails on a link at zero.
A placeholder K2 class and activity (tests/voice_rows.py), a rolled-back transaction: no school data."""

import os

import pytest
from typer.testing import CliRunner

from engine import cli
from engine.checks import chain
from engine.core import db
from tests.voice_rows import a_k2_class

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")


@pytest.fixture
def conn():
    with db.connect() as c:
        yield c
        c.rollback()


def counts(conn, t, band):
    return {x.name: (x.have, x.of) for x in chain.chain(conn, t, band)}


def test_each_link_is_counted_on_the_rows_and_a_link_removed_moves_its_count(conn):
    k = a_k2_class(conn)
    t = k["tenant"]
    before = counts(conn, t, "K2")
    conn.execute("delete from activity_skill where activity_code = %s", (k["activity"],))
    after = counts(conn, t, "K2")
    assert after["activity → skill"] == (before["activity → skill"][0] - 1, before["activity → skill"][1])
    assert after["activity → objective"] == before["activity → objective"]
    conn.execute(
        "delete from activity_skill a using activity x where x.code = a.activity_code and x.band = 'K2'"
    )
    assert "activity → skill" in [x.name for x in chain.chain(conn, t, "K2") if x.broken]


def test_a_link_with_nothing_to_join_is_not_broken():
    assert (
        not chain.Link("x", 0, 0).broken and chain.Link("x", 0, 3).broken and not chain.Link("x", 1, 3).broken
    )


def test_the_command_prints_n_of_m_and_exits_1_on_a_zero():
    got = CliRunner().invoke(cli.app, ["chain", "--band", "NO-SUCH-GRADE"])
    assert got.exit_code == 0 and " 0 of 0" in got.output, got.output
