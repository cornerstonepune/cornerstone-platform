"""CP-54: a run's rupee ceiling is the engine's, not a person's: the call that could cross it is never made."""

import os

import pytest

from engine.core import db, settings
from engine.skills import spend

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs the local copy (bin/testdb)")

SKILL = {"writer_model": "w", "validator_model": "v", "standard": "x"}


@pytest.fixture
def conn(monkeypatch):
    with db.connect() as c:
        real = settings.config
        measured = {"w": 1.0, "v": 2.5}
        monkeypatch.setattr(
            settings,
            "config",
            lambda conn, key, default=None, tenant=None: (
                measured if key == "skill.measured_inr_per_call" else real(conn, key, default, tenant)
            ),
        )
        yield c
        c.rollback()


def _spend(conn, flow, rupees):
    conn.execute(
        "insert into flow_run (tenant_id, flow, trigger, status, cost_inr) select id, %s, 'engine', 'ok', %s from tenant"
        " where slug = %s",
        (flow, rupees, db.tenant_slug()),
    )


def test_a_call_that_could_cross_the_ceiling_is_refused_before_it_is_made_and_one_that_cannot_is_made(conn):
    since = spend.started(conn)
    _spend(conn, "skill.a", 3.0)  # spent in this run already
    asked: list[str] = []

    def ask(purpose, variables, about):
        asked.append(purpose)
        return {"ok": True}

    guarded = spend.capped(ask, conn, {"a": SKILL}, limit=6.0, since=since)
    assert guarded("skill.a", {}, "x") == {"ok": True}  # 3.0 + 1.0 writer = 4.0 <= 6.0
    _spend(conn, "skill.a", 1.0)
    with pytest.raises(spend.SpendStop):  # 4.0 spent + 2.5 validator = 6.5 > 6.0
        guarded("skill.a.validate", {}, "x")
    assert asked == ["skill.a"], "the refused call was never asked"


def test_what_was_spent_before_the_run_began_does_not_count_against_its_ceiling(conn):
    _spend(conn, "skill.a", 500.0)
    since = spend.started(conn)
    assert spend.spent(conn, since) == 0.0
    _spend(conn, "skill.a.validate", 2.5)
    assert spend.spent(conn, since) == 2.5


def test_seed_goods_stops_at_the_ceiling_keeps_nothing_it_did_not_pass_and_lists_the_cases_left(
    conn, monkeypatch
):
    from typer.testing import CliRunner

    from engine.checks import cli_skill
    from engine.skills import machines

    skill = cli_skill._one("activity")
    models = {skill["writer_model"]: 1.0, skill["validator_model"]: 2.5}
    real = settings.config
    monkeypatch.setattr(
        settings,
        "config",
        lambda c, key, default=None, tenant=None: (
            models if key == "skill.measured_inr_per_call" else real(c, key, default, tenant)
        ),
    )
    made: list[str] = []

    def fake_model_ask(c, version=None, stage=None):
        def ask(purpose, variables, about):
            made.append(about)
            _spend(c, purpose, 1.0)  # every call the fake makes costs ₹1, recorded as flow_run does
            return {"_refused": "a test reply"}

        return ask

    monkeypatch.setattr(machines, "model_ask", fake_model_ask)
    try:
        out = CliRunner().invoke(cli_skill.skill_app, ["seed-goods", "activity", "--max-inr", "4"])
    finally:  # the command commits what it spent (as it must); a test cleans up what a command it starts commits
        with db.connect() as other:
            other.execute("delete from flow_run where flow like 'skill.activity%%' and cost_inr = 1")
            other.execute(
                "delete from config where key in ('skill_goods.activity', 'skill_goods_faults.activity')"
            )
            other.commit()
    assert "STOPPED at the ceiling" in out.output and "left:" in out.output, out.output
    assert len(made) <= 4, "the ceiling is ₹4 and each fake call costs ₹1: no fifth call"
    assert "kept 0 of" in out.output
    assert "refused on" in out.output and "off its schema" in out.output, (
        "the refusals' faults are named, by count"
    )
