"""CP-75, Done when 4: CP-11's generator proofs with CP-SAT in FET's place. The made-up ZP class and its 2031 fortnights are CP-11's own
(`specs/CP-11/proofs/cp11_world.py`); each claim of proofs 2 to 5 that is about the timetable is asserted here on `generate(...,
solver="cpsat")`. What cannot carry over is said, not hidden: "the kept files are FET's own, replayed through fet-cl" becomes "the kept
input is the same bytes twice", and the input FET searched until its time limit is proven impossible by CP-SAT at once, so running out of
time is shown with a solver that does. Nightly: not in the core."""

import datetime as dt
import os
import sys
from collections import Counter
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "specs" / "CP-11" / "proofs"))
import cp11_world as cp  # noqa: E402

from engine.adapters import cpsat  # noqa: E402
from engine.core import db  # noqa: E402
from engine.w2_print import tt_generate as gen  # noqa: E402

pytestmark = [
    pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)"),
    pytest.mark.usefixtures("forgets_what_it_commits"),
]
LIMITS = [("MATH", "fortnight", 9, None), ("ENG", "week", None, 4), ("EVS", "fortnight", None, 5)]
NEEDED = {"MATH": 9, "ENG": 8, "EVS": 5}
TWO = (("subject", "MATH"), ("subject", "ENG"), ("empty", None))


def generate(w) -> gen.Run:
    with db.connect() as c:
        run = gen.generate(c, cp.GRADE, w["section"], cp.YEAR, w["number"], solver="cpsat")
        c.rollback()
    return run


def blocks(mon):
    return [
        {"on_date": mon + dt.timedelta(days=2), "reason": "Field trip (proof)"},
        {"weekday": 2, "week_code": "B", "period": "P3", "reason": "Library visit (proof)"},
    ]


def test_2_every_needed_lesson_on_a_free_period_within_the_rules():
    mon = dt.date(2031, 9, 1)
    w = cp.world(mon, blocks=blocks(mon), limits=LIMITS)
    run = generate(w)
    assert (run.outcome, run.needed, run.placed) == ("placed", 22, 22)
    grid, taken = cp.cells(w), set()
    for lesson in run.draft:
        key = (str(lesson["date"]), str(lesson["period_id"]))
        assert grid.get(key) == "free", (
            f"a lesson on a {grid.get(key)} cell: {lesson}"
        )  # pinned untouched, blocked empty
        assert key not in taken, f"two lessons in one period: {lesson}"
        taken.add(key)
        assert lesson["week"] == cp.week_of(dt.date.fromisoformat(str(lesson["date"])), w["starts_on"])
    assert Counter(x["subject_code"] for x in run.draft) == Counter(NEEDED)  # within fewest and most
    assert Counter(x["week"] for x in run.draft if x["subject_code"] == "ENG") == {"A": 4, "B": 4}
    assert (
        max(Counter((x["subject_code"], str(x["date"])) for x in run.draft).values()) == 1
    )  # once a day where the count allows
    assert run.fet_version == cpsat.version() and run.input_text and run.output_text


def test_4_the_same_rules_twice_give_the_same_input_and_the_same_draft():
    mon = dt.date(2031, 9, 15)
    w = cp.world(mon, blocks=blocks(mon), limits=LIMITS)
    a, b = generate(w), generate(w)
    assert a.outcome == b.outcome == "placed"
    assert a.input_text and a.input_text == b.input_text and a.draft == b.draft


def test_3_unmet_rules_name_the_rule_and_running_out_of_time_is_never_called_impossible(monkeypatch):
    mon = dt.date(2031, 9, 29)
    w = cp.world(
        mon,
        blocks=[{"on_date": mon + dt.timedelta(days=2), "reason": "Sports day (proof)"}],
        limits=[("MATH", "fortnight", 30, None)],
        with_lessons=True,
    )
    before = cp.snapshot()
    run = generate(w)
    assert (run.outcome, run.needed) == ("unmeetable", 46) and run.placed < run.needed
    assert {str(w["limit_ids"][0]), str(w["block_ids"][0])} <= {str(r["id"]) for r in run.report["rules"]}

    mon = dt.date(2031, 10, 13)  # proof 3's third case: two subjects that both need Monday's one free period
    tight = cp.world(mon, frame={wd: TWO for wd in range(1, 6)}, with_lessons=True,
                     blocks=[{"on_date": mon, "period": p, "reason": "Assembly (proof)"} for p in ("P1", "P2")])  # fmt: skip
    before = cp.snapshot()
    run = generate(tight)
    assert (run.outcome, run.needed, run.placed) == (
        "unmeetable",
        20,
        0,
    )  # FET searched to its limit; CP-SAT proves it cannot be met
    assert any("Assembly (proof)" in r["words"] for r in run.report["rules"])
    monkeypatch.setattr(
        cpsat, "solve", lambda problem, seconds, seed: cpsat.Answer(cpsat.OUT_OF_TIME, version="test")
    )
    slow = generate(tight)
    assert slow.outcome == "not_found_in_time" and "no timetable found in" in slow.report["words"]
    assert "impossible" not in str(slow.report).lower()
    assert cp.snapshot() == before  # the timetable, the sessions and the plan lines are as they were


def test_5_a_fifteen_day_fortnight_is_drafted_day_by_day_and_the_holiday_is_empty():
    start, holiday, last = dt.date(2031, 10, 27), dt.date(2031, 10, 29), dt.date(2031, 11, 10)
    w = cp.world(start, days=15, frame={wd: TWO for wd in range(1, 6)}, holidays=[holiday])
    run = generate(w)
    days = cp.teaching_days(w)
    assert len(days) == 10 and last in days and holiday not in days
    assert (run.outcome, run.needed, run.placed) == ("placed", 20, 20)
    assert {str(x["date"]) for x in run.draft} == {d.isoformat() for d in days}
    assert {x["week"] for x in run.draft if str(x["date"]) == last.isoformat()} == {"B"}
