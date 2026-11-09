"""CP-11 item 3: when the rules cannot be met, the command reports lessons placed against lessons needed and names the
blocking rule (the limit or block, in its own words) when the system can find it; if FET runs out of time it says
"no timetable found in time", never "impossible". In every case nothing is written to the timetable, the sessions or
the plan lines. One test per case.

  * too many lessons: MATH fortnight fewest 30 on the standing frame with a whole blocked day: 46 lessons needed
    (MATH 30, ENG 10, EVS 6) against 26 free periods. Code finds it (design 1.5 c): outcome `unmeetable`, the limit
    and the block named by id in the report and in their own words on screen.
  * contradicting limits: MATH at least 5 a week and at most 6 a fortnight (design 1.5 a): `unmeetable`, both named.
  * out of time: MATH and ENG each fill one period on every one of ten days (10 lessons in 10 days, so at most once a
    day), and Monday of week A has P1 and P2 blocked, leaving one free period for two subjects that both need that
    day. The totals pass the design's three checks (20 needed, 28 free), so FET is run; on FET 6.8.5 it searches until
    its time limit (pinned by the proof-writer: "Time exceeded" after ~1 s). With `timetable.solve_seconds` = 1 the
    outcome is `not_found_in_time`.
"""

import datetime as dt
import json

import pytest

from cp11_world import (generate, need_fet, one_run, printed, said, setting, snapshot, world)

pytestmark = pytest.mark.usefixtures("forgets_what_it_commits")

TWO = (("subject", "MATH"), ("subject", "ENG"), ("empty", None))
TIGHT = {wd: TWO for wd in range(1, 6)}


def _kept_and_counted(w, out, outcome):
    run = one_run(w, out)
    assert run["outcome"] == outcome, f"outcome {run['outcome']!r}, not {outcome!r}; {said(out)}"
    assert printed(out.stdout) == (run["needed"], run["placed"]), "printed numbers are not the run's"
    assert run["placed"] < run["needed"], (run["placed"], run["needed"])
    return run


def test_3_too_many_lessons_reports_placed_against_needed_and_names_the_limit_and_block():
    mon = dt.date(2031, 6, 16)
    w = world(mon, blocks=[{"on_date": mon + dt.timedelta(days=2), "reason": "Sports day (proof)"}],
              limits=[("MATH", "fortnight", 30, None)], with_lessons=True)
    before = snapshot()
    out = generate(w)
    run = _kept_and_counted(w, out, "unmeetable")
    assert run["needed"] == 46, run["needed"]
    report = json.dumps(run["report"])
    for rule in (w["limit_ids"][0], w["block_ids"][0]):
        assert str(rule) in report, f"rule {rule} not named in the report: {report[:800]}"
    assert "Sports day (proof)" in out.stdout, f"the block is not named in its own words: {out.stdout[-1500:]}"
    assert "MATH" in out.stdout and "30" in out.stdout, f"the limit is not named in its own words: {out.stdout[-1500:]}"
    assert snapshot() == before, "the timetable, the sessions or the plan lines changed"


def test_3_contradicting_limits_are_named():
    w = world(dt.date(2031, 6, 30), limits=[("MATH", "week", 5, None), ("MATH", "fortnight", None, 6)],
              with_lessons=True)
    before = snapshot()
    out = generate(w)
    run = _kept_and_counted(w, out, "unmeetable")
    report = json.dumps(run["report"])
    for rule in w["limit_ids"]:
        assert str(rule) in report, f"limit {rule} not named in the report: {report[:800]}"
    shown = out.stdout.lower()
    assert "math" in shown and "week" in shown and "fortnight" in shown, out.stdout[-1500:]
    assert snapshot() == before, "the timetable, the sessions or the plan lines changed"


def test_3_out_of_time_says_no_timetable_found_in_time_never_impossible():
    need_fet()
    mon = dt.date(2031, 7, 14)
    w = world(mon, frame=TIGHT, with_lessons=True,
              blocks=[{"on_date": mon, "period": "P1", "reason": "Assembly (proof)"},
                      {"on_date": mon, "period": "P2", "reason": "Assembly (proof)"}])
    before = snapshot()
    with setting(w["t"], "timetable.solve_seconds", 1):
        out = generate(w)
    run = _kept_and_counted(w, out, "not_found_in_time")
    assert run["needed"] == 20 and run["solve_seconds"] == 1, (run["needed"], run["solve_seconds"])
    assert "no timetable found in" in out.stdout.lower(), out.stdout[-1500:]
    assert "impossible" not in out.stdout.lower(), "a timeout was told as impossible"
    assert "impossible" not in json.dumps(run["report"]).lower(), "a timeout was recorded as impossible"
    assert snapshot() == before, "the timetable, the sessions or the plan lines changed"
