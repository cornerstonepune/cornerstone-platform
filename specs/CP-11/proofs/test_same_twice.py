"""CP-11 item 4: running the command twice on the same rules gives the same input file and the same draft.

The rules are item 2's (a blocked day, a blocked period, three limits) on a fortnight of their own (28 Jul 2031). Two
runs are kept; their `input_text` is equal byte for byte and their `draft` is equal.
"""

import datetime as dt

import pytest

from cp11_world import generate, lessons, need_fet, runs, said, world

pytestmark = pytest.mark.usefixtures("forgets_what_it_commits")

LIMITS = [("MATH", "fortnight", 9, None), ("ENG", "week", None, 4), ("EVS", "fortnight", None, 5)]  # item 2's


def test_4_same_rules_twice_same_input_file_and_same_draft():
    need_fet()
    mon = dt.date(2031, 7, 28)
    w = world(mon, limits=LIMITS, blocks=[{"on_date": mon + dt.timedelta(days=2), "reason": "Field trip (proof)"},
                                          {"weekday": 2, "week_code": "B", "period": "P3", "reason": "Library (proof)"}])
    first = generate(w)
    assert first.returncode == 0, said(first)
    second = generate(w)
    assert second.returncode == 0, said(second)
    kept = runs(w, second)
    assert len(kept) == 2, f"{len(kept)} runs kept, not 2"
    a, b = kept
    assert a["outcome"] == b["outcome"] == "placed", (a["outcome"], b["outcome"])
    assert a["input_text"] and a["input_text"] == b["input_text"], "the input file differs between the two runs"
    assert lessons(a) == lessons(b), "the draft differs between the two runs"
