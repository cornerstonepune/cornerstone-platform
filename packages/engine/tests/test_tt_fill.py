"""CP-74, Done when 4, 5, 6 and 7 (specs/CP-74/spec.md): spreading a unit over a fortnight's lessons, "same as last week" and the suggestion job,
through the pure `tt_fill`. No database: lessons and objectives are plain rows, and "applying" an answer is setting them on those rows, as the
writer will. Done when 7's last part (a re-publish) is proven with the writer, on a database, once the columns exist."""

import datetime as dt

import pytest

from engine.w2_print import tt_fill
from engine.w2_print.tt_live_plan import Refused
from tests.test_tt_offer import OBJECTIVES

TODAY = dt.date(2033, 12, 5)  # a Monday
ORDER = ["F1", "F2", "F3", "F4", "S1", "S2"]


def lesson(n, day, **more):
    """Lesson `n` of the class's Maths, on a day of December 2033, in the first period."""
    return {
        "id": f"L{n}", "on_date": dt.date(2033, 12, day), "period_id": "P1", "starts": "08:45", "state": "planned", "holiday": False,
        "fixed": False, "lo_code": None, "activity_code": None, "source": "machine", **more,
    }  # fmt: skip


def placed(out):
    return [(p["id"], p["lo_code"]) for p in out["lessons"]]


def test_spread_gives_each_objective_its_share_of_the_lessons_and_lists_what_is_left_over():
    """Done when 4."""
    five = [lesson(n, 4 + n) for n in range(1, 6)]
    # k < n: 5 // 2 = 2 each, and the first 5 % 2 = 1 objective gets one more
    assert placed(tt_fill.spread(["F1", "F2"], five)) == [
        ("L1", "F1"),
        ("L2", "F1"),
        ("L3", "F1"),
        ("L4", "F2"),
        ("L5", "F2"),
    ]
    # k = n: one each
    assert [c for _, c in placed(tt_fill.spread(ORDER[:5], five))] == ORDER[:5]
    # k > n: the first n get one lesson each, the rest are left for next fortnight
    out = tt_fill.spread(ORDER, five)
    assert [c for _, c in placed(out)] == ORDER[:5] and out["left_over"] == ["S2"]
    # a holiday and a fixed lesson take nothing, and are named
    out = tt_fill.spread(
        ["F1", "F2"], [five[0], {**five[1], "holiday": True}, {**five[2], "fixed": True}, five[3], five[4]]
    )
    assert (
        placed(out) == [("L1", "F1"), ("L4", "F1"), ("L5", "F2")]
        and out["skipped"] == ["L2", "L3"]
        and out["left_over"] == []
    )


def test_same_as_last_week_copies_the_objective_and_activity_and_refuses_in_words_when_there_is_none():
    """Done when 5."""
    last = lesson(1, 6, lo_code="F2", activity_code="ACT-ROTI", source="person")
    this = lesson(2, 13)
    assert tt_fill.same_as_last_week(this, [last, this], subject="Maths") == {
        "lo_code": "F2",
        "activity_code": "ACT-ROTI",
        "from": "L1",
    }
    with pytest.raises(Refused, match="no Maths lesson on Tuesday 6 December"):
        tt_fill.same_as_last_week(this, [this], subject="Maths")
    with pytest.raises(Refused, match="Tuesday 6 December has nothing chosen yet"):
        tt_fill.same_as_last_week(this, [lesson(1, 6), this], subject="Maths")


def test_the_suggestion_job_fills_only_empty_or_machine_made_lessons_and_a_second_run_changes_nothing():
    """Done when 6."""
    lessons = [
        lesson(0, 2, lo_code="F1", state="done"),  # last week: the last one taught
        lesson(1, 5),  # empty: filled
        lesson(2, 6, lo_code="S2"),  # a machine-made suggestion that is now out of step: put right
        lesson(3, 7, holiday=True),
        lesson(4, 8),
    ]
    first = tt_fill.suggest(OBJECTIVES, lessons, TODAY)
    assert first == [
        {"id": "L1", "lo_code": "F2"},
        {"id": "L2", "lo_code": "F3"},
        {"id": "L4", "lo_code": "F4"},
    ]
    for change in first:  # what the writer does: the objective, marked machine-made
        next(x for x in lessons if x["id"] == change["id"]).update(
            lo_code=change["lo_code"], source="machine"
        )
    assert tt_fill.suggest(OBJECTIVES, lessons, TODAY) == []
    # no order somebody checked, or nothing taught yet: nothing is suggested (she is shown the whole subject instead)
    assert tt_fill.suggest(OBJECTIVES, lessons, TODAY, ordered=False) == []
    assert tt_fill.suggest(OBJECTIVES, [lesson(1, 5), lesson(2, 6)], TODAY) == []


def test_a_lesson_a_person_set_is_left_alone_by_the_suggestion_job_and_by_a_spread_of_other_lessons():
    """Done when 7 (the suggestion job and spread; the re-publish is proven with the writer)."""
    hers = lesson(2, 6, lo_code="S1", activity_code="ACT-TANGRAM", source="person")
    k2 = lesson(
        3, 7, activity_code="ACT-CLAY", source="person"
    )  # an activity she chose, no objective: still hers
    lessons = [lesson(0, 2, lo_code="F1", state="done"), lesson(1, 5), hers, k2, lesson(4, 8)]
    out = tt_fill.suggest(OBJECTIVES, lessons, TODAY)
    assert [c["id"] for c in out] == ["L1", "L4"]
    # her lesson is not only kept: what follows it carries on from what she chose
    assert out == [{"id": "L1", "lo_code": "F2"}, {"id": "L4", "lo_code": "S2"}]
    # spread writes only the lessons it was handed
    assert [i for i, _ in placed(tt_fill.spread(["F2", "F3"], [lessons[1], lessons[4]]))] == ["L1", "L4"]
