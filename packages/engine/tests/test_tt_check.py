"""CP-71, Done when 5, 6 and 7 (specs/CP-71/spec.md): the pattern checker through `tt_check_load.check`, on the made-up 2033 school (a K2 class
with Maths every day, a Grade 2 class, one educator for Maths in both). Each test works in a transaction that is rolled back.
Also: a Must problem is allowed only by the coordinators, with a reason; the pure checker needs no database."""

import datetime as dt
import os

import pytest

from engine.core import db
from engine.w2_print import tt_check, tt_check_fix, tt_check_load, tt_pattern
from tests import tt_check_world as cw
from tests import tt_hand_world as tw
from tests import tt_pattern_world as pw

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")
FROM = tw.START + dt.timedelta(days=14)
TODAY = tw.START - dt.timedelta(days=7)


@pytest.fixture
def world():
    with db.connect() as c:
        w = tw.school(c)
        w["g2"] = cw.g2(c, w)
        w["maths_educator"] = cw.educator(c, w, [(w["class"], "NUM"), (w["g2"]["class"], "NUM")])
        yield c, w
        c.rollback()


def put(c, w, klass, period_ids, where, **what):
    """Cells in `klass` set by the coordinator, from FROM. `where` is a list of (week, weekday)."""
    edits = [
        {"period_id": str(period_ids), "week": wk, "weekday": wd, "cell": "subject", **what}
        for wk, wd in where
    ]
    tt_pattern.change(c, pw.coordinator(w), str(klass), edits, FROM, today=TODAY)


def problems(c, w, kind=None):
    got = tt_check_load.check(c, [str(w["class"]), str(w["g2"]["class"])], FROM)
    return [p for p in got["problems"] if kind in (None, p["kind"])]


def test_one_educator_in_two_classes_at_overlapping_times_is_exactly_one_problem_naming_both_classes_the_day_and_the_times(
    world,
):  # Done when 5
    c, w = world
    put(c, w, w["g2"]["class"], w["g2"]["period"]["early"], [("A", 1)], subject_code="NUM", text="Maths")
    found = problems(c, w, "educator")
    assert len(found) == 1
    said = found[0]["sentence"]
    k2 = f"K2 {w['section']}"
    g2 = c.execute(
        "select 'G2 ' || section as s from school_class where id = %s", (w["g2"]["class"],)
    ).fetchone()["s"]
    assert k2 in said and g2 in said and "Monday" in said and "week A" in said
    assert "04:40 to 05:05" in said and "04:50 to 05:30" in said
    assert found[0]["level"] == "must"


def test_the_same_educator_at_times_that_do_not_overlap_is_no_problem(world):  # Done when 5
    c, w = world
    put(c, w, w["g2"]["class"], w["g2"]["period"]["late"], [("A", 1)], subject_code="NUM", text="Maths")
    assert problems(c, w, "educator") == []


def test_a_subject_nobody_is_named_for_is_skipped_and_said(world):  # design F8: never a silent pass
    c, w = world
    put(c, w, w["g2"]["class"], w["g2"]["period"]["early"], [("A", 1)], subject_code="HIN", text="Hindi")
    got = tt_check_load.check(c, [str(w["class"]), str(w["g2"]["class"])], FROM)
    assert any("Hindi" in n and "skip" in n for n in got["notes"])


def test_over_the_most_in_a_day_is_a_try_to_that_does_not_stop_publishing_and_over_the_weekly_most_is_a_must_that_does(
    world,
):  # Done when 6
    c, w = world
    k = w["class"]
    put(
        c, w, k, w["period"]["p2"], [("A", 1)], subject_code="math", text="Maths"
    )  # Maths twice on Monday of week A
    cw.limit(c, w, k, "math", "day", 1, weight=5)
    got = tt_check_load.check(c, [str(k)], FROM)
    day = [p for p in got["problems"] if p["kind"] == "most_in_day"]
    assert (
        len(day) == 1
        and day[0]["level"] == "try"
        and "Maths" in day[0]["sentence"]
        and "Monday" in day[0]["sentence"]
    )
    assert got["blocking"] == [] and got["counts"] == {"must": 0, "try": 1}
    cw.limit(c, w, k, "math", "week", 5)  # six Maths in week A now
    got = tt_check_load.check(c, [str(k)], FROM)
    week = [p for p in got["problems"] if p["kind"] == "most_in_week"]
    assert len(week) == 1 and week[0]["level"] == "must" and got["blocking"] == [week[0]["key"]]


def test_an_educator_who_is_away_makes_a_must_problem_for_each_lesson_they_would_teach(world):
    c, w = world
    cw.away(c, w, w["maths_educator"], 2, "A")
    found = problems(c, w, "away")
    assert [(p["places"][0]["week"], p["places"][0]["weekday"]) for p in found] == [("A", 2)]
    assert "away" in found[0]["sentence"] and "Tuesday" in found[0]["sentence"]


class _Undo(Exception):
    pass


def test_every_fix_offered_removes_its_problem_and_adds_no_must_problem(world):  # Done when 7
    c, w = world
    k, g2 = w["class"], w["g2"]
    put(
        c, w, g2["class"], g2["period"]["early"], [("A", 1)], subject_code="NUM", text="Maths"
    )  # an educator clash
    put(
        c, w, k, w["period"]["p2"], [("A", 3)], subject_code="math", text="Maths"
    )  # Maths twice on Wednesday of week A
    cw.limit(c, w, k, "math", "day", 1, weight=5)
    cw.limit(c, w, k, "math", "week", 5)  # and six in week A
    cw.away(c, w, w["maths_educator"], 4, "B")  # and an educator away on Thursday of week B
    base = problems(c, w)
    assert {p["kind"] for p in base} >= {"educator", "most_in_day", "most_in_week", "away"}
    must_before = {p["key"] for p in base if p["level"] == "must"}
    for p in base:
        assert p["fixes"], f"no fix offered for: {p['sentence']}"
        for f in p["fixes"]:
            try:
                with c.transaction():
                    tt_pattern.change(c, pw.coordinator(w), f["class_id"], f["edits"], FROM, today=TODAY)
                    after = problems(c, w)
                    assert p["key"] not in {a["key"] for a in after}, f["sentence"]
                    assert {a["key"] for a in after if a["level"] == "must"} <= must_before, f["sentence"]
                    raise _Undo  # the fix is tried, then put back, so the next one starts from the same pattern
            except _Undo:
                pass


def test_a_must_problem_is_allowed_only_by_the_coordinators_with_a_reason_and_then_does_not_block(world):
    c, w = world
    k = w["class"]
    cw.limit(c, w, k, "math", "week", 4)  # five Maths a week against four
    first = tt_check_load.check(c, [str(k)], FROM)
    assert first["blocking"], "the weekly most is a Must"
    key = first["problems"][0]["allow_key"]
    who = pw.coordinator(w)
    with pytest.raises(tt_pattern.Refused, match="reason"):
        tt_check_load.allow(c, who, [str(k)], key, " ", FROM, today=TODAY)
    with pytest.raises(tt_pattern.Refused) as no:  # a class teacher is not in the group
        tt_check_load.allow(c, w["staff"]["educator"]["id"], [str(k)], key, "fine", FROM, today=TODAY)
    assert no.value.status == 403
    tt_check_load.allow(c, who, [str(k)], key, "the school keeps five", FROM, today=TODAY)
    after = tt_check_load.check(c, [str(k)], FROM)
    assert (
        key not in after["blocking"]
        and next(p for p in after["problems"] if p["allow_key"] == key)["allowed"]
    )


def test_the_pure_checker_needs_no_database():
    w = tt_check.World(
        {"a": "G2 A"}, {"p": {"label": "P1", "start": "09:00", "end": "09:40", "ord": 1, "fixed": False}}, {"a": ["p"]},
        {("a", "p", "A", 1): {"cell": "subject", "subject_code": "NUM", "text": "Maths"}}, {("a", "NUM", "subject"): "s1"},
        labels={"NUM": "Maths"},
    )  # fmt: skip
    assert tt_check.check(w) == [] and tt_check_fix.with_fixes(w, []) == []
