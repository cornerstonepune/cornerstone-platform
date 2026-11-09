"""CP-11 item 2: `bin/engine timetable generate` with the class and the fortnight makes a draft that places every needed
lesson: each on a free period, each subject within its fewest and most, a subject at most once a day where its count
allows, pinned periods untouched, blocked days and periods empty; the draft keeps FET's exact input and output file.

The made-up fortnight (cp11_world.FRAME, 2 to 13 Jun 2031, ten teaching days) has a whole blocked day (Wednesday of
week A), one blocked period (Tuesday of week B, P3, an ENG cell) and three limits:
  MATH fortnight fewest 9 (frame gives 8, raised to 9), ENG week most 4 (frame gives 5 a week, lowered to 4),
  EVS fortnight most 5 (frame gives 6, lowered to 5).
So 22 lessons are needed: MATH 9, ENG 4 + 4, EVS 5. Nine days are free of blocks, so every subject's count is within
its days and each falls at most once a day. The kept run is replayed on the real fet-cl (pinned flags, cp11_world).
"""

import datetime as dt
import re
from collections import Counter

import pytest

from cp11_world import (PERIODS, cells, fet_version, generate, lessons, need_fet, one_run, printed, replay, said, week_of,
                        world)

pytestmark = pytest.mark.usefixtures("forgets_what_it_commits")

MON = dt.date(2031, 6, 2)
BLOCKS = [{"on_date": MON + dt.timedelta(days=2), "reason": "Field trip (proof)"},
          {"weekday": 2, "week_code": "B", "period": "P3", "reason": "Library visit (proof)"}]
LIMITS = [("MATH", "fortnight", 9, None), ("ENG", "week", None, 4), ("EVS", "fortnight", None, 5)]
NEEDED = {"MATH": 9, "ENG": 8, "EVS": 5}


def test_2_every_needed_lesson_placed_on_a_free_period_within_the_rules_and_fet_files_kept():
    need_fet()
    w = world(MON, blocks=BLOCKS, limits=LIMITS)
    out = generate(w)
    assert out.returncode == 0, said(out)
    run = one_run(w, out)
    assert run["outcome"] == "placed", run["outcome"]
    assert run["needed"] == run["placed"] == sum(NEEDED.values()), (run["needed"], run["placed"])
    assert printed(out.stdout) == (run["needed"], run["placed"])

    draft = lessons(run)
    assert len(draft) == run["placed"], f"{len(draft)} lessons in the draft, {run['placed']} placed"
    grid = cells(w)
    taken = set()
    for lesson in draft:
        key = (str(lesson["date"]), str(lesson["period_id"]))
        assert key in grid, f"a lesson on a day or period outside the fortnight's teaching days: {lesson}"
        assert grid[key] == "free", f"a lesson on a {grid[key]} cell: {lesson}"  # pinned untouched, blocked empty
        assert key not in taken, f"two lessons in one period: {lesson}"
        taken.add(key)
        day = dt.date.fromisoformat(str(lesson["date"]))
        assert lesson["week"] == week_of(day, w["starts_on"]), lesson
    assert not any(str(lesson["date"]) == (MON + dt.timedelta(days=2)).isoformat() for lesson in draft), \
        "a lesson on the blocked day"

    assert Counter(lesson["subject_code"] for lesson in draft) == Counter(NEEDED)  # within fewest and most
    eng = Counter(lesson["week"] for lesson in draft if lesson["subject_code"] == "ENG")
    assert eng == {"A": 4, "B": 4}, f"ENG's week limit (most 4) not kept per week: {dict(eng)}"
    per_day = Counter((lesson["subject_code"], str(lesson["date"])) for lesson in draft)
    assert max(per_day.values()) == 1, f"a subject twice on one day where its count allows once: {per_day}"

    # FET's exact files: the kept input, replayed with the kept seed and time limit, gives back the kept output,
    # and the draft is that output read through the input.
    assert run["fet_version"] == fet_version(), (run["fet_version"], fet_version())
    files, placed, subjects = replay(run)
    kept = (run["output_text"] or "").lstrip("﻿")
    assert kept in [f.lstrip("﻿") for f in files], "output_text is not the file FET writes for the kept input"
    assert len(subjects) == run["needed"], f"{len(subjects)} activities in the input, {run['needed']} needed"
    want = Counter((re.search(r"\d{4}-\d{2}-\d{2}", day).group(), hour[:5], subjects[i]) for i, (day, hour) in placed.items())
    got = Counter((str(lesson["date"]), _start(w, lesson["period_id"]), lesson["subject_code"]) for lesson in draft)
    assert got == want, f"the draft is not FET's output: draft {sorted(got)[:5]}…, FET {sorted(want)[:5]}…"


def _start(w, period_id) -> str:
    name = next(k for k, v in w["periods"].items() if str(v) == str(period_id))
    return PERIODS[name]
